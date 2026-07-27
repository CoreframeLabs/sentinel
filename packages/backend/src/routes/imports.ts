import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { Pool } from 'pg';
import { Logger } from '../logger';
import { withTransaction } from '../db';
import { requireRole } from '../middleware/auth';
import * as controlsRepo from '../repositories/controls';
import * as profilesRepo from '../repositories/csvImportProfiles';
import * as importsRepo from '../repositories/csvImports';
import * as auditLog from '../repositories/auditLog';
import { CsvColumnMapping } from '../repositories/types';
import {
  CSV_ALLOWED_MIME_TYPES,
  CSV_MAX_FILE_SIZE_BYTES,
  CSV_PREVIEW_ROW_COUNT,
  CsvMappingError,
  CsvParseError,
  MAPPABLE_FIELDS,
  fileChecksum,
  parseCsv,
  validateRows,
  ParsedCsv,
  ValidationSummary,
} from '../lib/csvImport';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * CSV import endpoints. The uploaded file is held in memory only (multer
 * memory storage) — it is never written to disk or stored in the database;
 * only its SHA-256 checksum and the row-level outcomes are persisted.
 *
 * The dry run is stateless: no server-side draft, session state or cookie
 * carries validation results between requests. The confirmation endpoint
 * receives the file again and re-validates every row itself.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CSV_MAX_FILE_SIZE_BYTES, files: 1 },
});

/** Runs multer and translates its errors: an oversized file is 413, any other
 * malformed upload is 400 — never an opaque 500. */
function uploadCsvFile(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File exceeds the 5MB limit' });
        return;
      }
      res.status(400).json({ error: 'Invalid upload' });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

/**
 * The organisation an import writes into always comes from the session. A
 * request that tries to name a different organisation is rejected outright
 * rather than silently ignored, so the attempt is visible to the caller.
 */
function rejectForeignOrganisation(req: Request, res: Response, organisationId: string): boolean {
  const supplied = (req.body?.organisationId ?? req.query.organisationId) as string | undefined;
  if (typeof supplied === 'string' && supplied !== '' && supplied !== organisationId) {
    res.status(403).json({ error: 'Cannot import into a different organisation' });
    return true;
  }
  return false;
}

/** Returns the validated CSV file or responds 415/400 and returns null. */
function requireCsvFile(req: Request, res: Response): Buffer | null {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'A CSV file is required (multipart field "file")' });
    return null;
  }
  if (!CSV_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    res.status(415).json({ error: 'Only CSV files are accepted (text/csv)' });
    return null;
  }
  return file.buffer;
}

/** Parses the multipart "mapping" field. Responds 400 and returns null when
 * missing or malformed. */
function requireMapping(req: Request, res: Response): CsvColumnMapping | null {
  const raw = req.body?.mapping;
  if (typeof raw !== 'string' || !raw.trim()) {
    res.status(400).json({ error: 'mapping is required (JSON field mapping control fields to CSV columns)' });
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    res.status(400).json({ error: 'mapping must be valid JSON' });
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    res.status(400).json({ error: 'mapping must be a JSON object' });
    return null;
  }
  const mapping: Record<string, string> = {};
  for (const [field, header] of Object.entries(parsed as Record<string, unknown>)) {
    if (!(MAPPABLE_FIELDS as readonly string[]).includes(field)) {
      res.status(400).json({ error: `mapping contains unknown field "${field}"` });
      return null;
    }
    if (header === undefined || header === null || header === '') continue;
    if (typeof header !== 'string') {
      res.status(400).json({ error: `mapping.${field} must be a CSV column header string` });
      return null;
    }
    mapping[field] = header;
  }
  return mapping as unknown as CsvColumnMapping;
}

/** Parses and validates in one step, translating CSV/mapping errors to 400.
 * Returns null after responding when the file or mapping is unusable. */
function parseAndValidate(
  file: Buffer,
  mapping: CsvColumnMapping,
  res: Response
): { parsed: ParsedCsv; summary: ValidationSummary } | null {
  try {
    const parsed = parseCsv(file);
    return { parsed, summary: validateRows(parsed, mapping) };
  } catch (err) {
    if (err instanceof CsvParseError || err instanceof CsvMappingError) {
      res.status(400).json({ error: err.message });
      return null;
    }
    throw err;
  }
}

export function importsRouter(pool: Pool, log: Logger): Router {
  const router = Router();

  /** Step 1 — upload and parse: headers plus a five-row preview. Nothing is
   * written to the database. */
  router.post('/imports/parse', requireRole('admin', 'manager'), uploadCsvFile, (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      if (rejectForeignOrganisation(req, res, organisationId)) return;
      const file = requireCsvFile(req, res);
      if (!file) return;

      let parsed: ParsedCsv;
      try {
        parsed = parseCsv(file);
      } catch (err) {
        if (err instanceof CsvParseError) {
          res.status(400).json({ error: err.message });
          return;
        }
        throw err;
      }
      log.info(
        { org_id: organisationId, user_id: req.session.userId, total_rows: parsed.rows.length },
        'import_started'
      );
      res.json({
        headers: parsed.headers,
        preview: parsed.rows.slice(0, CSV_PREVIEW_ROW_COUNT),
        totalRows: parsed.rows.length,
        filenameChecksum: fileChecksum(file),
      });
    } catch (err) {
      next(err);
    }
  });

  /** Step 3 — validation dry run. Re-parses and validates the full file;
   * returns the accepted/rejected split with per-row reasons. No writes. */
  router.post('/imports/dry-run', requireRole('admin', 'manager'), uploadCsvFile, (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      if (rejectForeignOrganisation(req, res, organisationId)) return;
      const file = requireCsvFile(req, res);
      if (!file) return;
      const mapping = requireMapping(req, res);
      if (!mapping) return;
      const result = parseAndValidate(file, mapping, res);
      if (!result) return;

      const { summary } = result;
      log.info(
        {
          org_id: organisationId,
          user_id: req.session.userId,
          total_rows: summary.totalRows,
          accepted_rows: summary.acceptedRows,
          rejected_rows: summary.rejectedRows,
        },
        'import_dry_run_completed'
      );
      res.json({
        totalRows: summary.totalRows,
        acceptedRows: summary.acceptedRows,
        rejectedRows: summary.rejectedRows,
        rejections: summary.rows
          .filter((r) => r.status === 'rejected')
          .map((r) => ({ rowNumber: r.rowNumber, values: r.values, reason: r.rejectionReason })),
        // A short preview of what confirming would create. Capped rather
        // than returned in full: an accepted 5MB file can hold thousands of
        // rows, and the counts above already carry the totals.
        acceptedPreview: summary.rows
          .filter((r) => r.status === 'accepted')
          .slice(0, CSV_PREVIEW_ROW_COUNT)
          .map((r) => ({
            rowNumber: r.rowNumber,
            name: r.control!.name,
            category: r.control!.category,
            dueDate: r.control!.dueDate,
          })),
      });
    } catch (err) {
      next(err);
    }
  });

  /** Step 4 — confirm. Validation runs again from the submitted file — any
   * client-supplied claim about which rows passed is ignored. Accepted rows
   * become controls; every row's outcome is recorded append-only. */
  router.post('/imports/confirm', requireRole('admin', 'manager'), uploadCsvFile, async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const userId = req.session.userId!;
      if (rejectForeignOrganisation(req, res, organisationId)) return;
      const file = requireCsvFile(req, res);
      if (!file) return;
      const mapping = requireMapping(req, res);
      if (!mapping) return;

      const profileIdRaw = req.body?.profileId;
      let profileId: string | null = null;
      if (typeof profileIdRaw === 'string' && profileIdRaw !== '') {
        if (!UUID_RE.test(profileIdRaw)) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        // Organisation-scoped lookup: a profile from another organisation is
        // indistinguishable from a missing one.
        const profile = await profilesRepo.findProfileById(pool, organisationId, profileIdRaw);
        if (!profile) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        profileId = profile.id;
      }

      const result = parseAndValidate(file, mapping, res);
      if (!result) return;
      const { summary } = result;

      const run = await withTransaction(pool, async (tx) => {
        const created = await importsRepo.createImportRun(tx, organisationId, {
          profileId,
          filenameChecksum: fileChecksum(file),
          totalRows: summary.totalRows,
          acceptedRows: summary.acceptedRows,
          rejectedRows: summary.rejectedRows,
          createdBy: userId,
        });
        await auditLog.appendAuditEntry(tx, organisationId, {
          userId,
          action: 'import_run_created',
          controlId: null,
          importRunId: created.id,
        });

        for (const row of summary.rows) {
          if (row.status === 'accepted' && row.control) {
            const control = await controlsRepo.createControl(tx, organisationId, {
              name: row.control.name,
              description: row.control.description,
              category: row.control.category,
              dueDate: row.control.dueDate,
            });
            await importsRepo.appendRowResult(tx, {
              importRunId: created.id,
              rowNumber: row.rowNumber,
              rowChecksum: row.checksum,
              status: 'accepted',
              rejectionReason: null,
              controlId: control.id,
            });
            await auditLog.appendAuditEntry(tx, organisationId, {
              userId,
              action: 'control_created_by_import',
              controlId: control.id,
              importRunId: created.id,
            });
          } else {
            await importsRepo.appendRowResult(tx, {
              importRunId: created.id,
              rowNumber: row.rowNumber,
              rowChecksum: row.checksum,
              status: 'rejected',
              rejectionReason: row.rejectionReason,
              controlId: null,
            });
          }
        }
        return created;
      });

      // Row-level events are logged after commit so the log never shows rows
      // for an import that rolled back. Row numbers and outcomes only —
      // never cell values.
      for (const row of summary.rows) {
        log.info(
          {
            org_id: organisationId,
            import_run_id: run.id,
            user_id: userId,
            row_number: row.rowNumber,
          },
          row.status === 'accepted' ? 'import_row_accepted' : 'import_row_rejected'
        );
      }
      log.info(
        {
          org_id: organisationId,
          import_run_id: run.id,
          user_id: userId,
          total_rows: run.total_rows,
          accepted_rows: run.accepted_rows,
          rejected_rows: run.rejected_rows,
        },
        'import_confirmed'
      );
      res.status(201).json({ importRun: run });
    } catch (err) {
      next(err);
    }
  });

  /** Step 5 — import history. */
  router.get('/imports', requireRole('admin', 'manager'), async (req, res, next) => {
    try {
      const runs = await importsRepo.listImportRuns(pool, req.session.organisationId!);
      res.json({ importRuns: runs });
    } catch (err) {
      next(err);
    }
  });

  router.get('/imports/:id/rows', requireRole('admin', 'manager'), async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const id = req.params.id!;
      if (!UUID_RE.test(id)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const run = await importsRepo.findImportRunById(pool, organisationId, id);
      if (!run) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const rows = await importsRepo.listRowResultsForRun(pool, organisationId, id);
      res.json({ importRun: run, rows });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------- Saved mapping profiles ---------------- */

  router.get('/import-profiles', requireRole('admin', 'manager'), async (req, res, next) => {
    try {
      const profiles = await profilesRepo.listProfiles(pool, req.session.organisationId!);
      res.json({ profiles });
    } catch (err) {
      next(err);
    }
  });

  router.get('/import-profiles/:id', requireRole('admin', 'manager'), async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const id = req.params.id!;
      if (!UUID_RE.test(id)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const profile = await profilesRepo.findProfileById(pool, organisationId, id);
      if (!profile) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json({ profile });
    } catch (err) {
      next(err);
    }
  });

  router.post('/import-profiles', requireRole('admin', 'manager'), async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const { name, mapping } = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      if (typeof mapping !== 'object' || mapping === null || typeof mapping.name !== 'string') {
        res.status(400).json({ error: 'mapping with a "name" column is required' });
        return;
      }
      for (const field of Object.keys(mapping as Record<string, unknown>)) {
        if (!(MAPPABLE_FIELDS as readonly string[]).includes(field)) {
          res.status(400).json({ error: `mapping contains unknown field "${field}"` });
          return;
        }
      }
      const profile = await profilesRepo.createProfile(pool, organisationId, {
        name: name.trim(),
        columnMapping: mapping as CsvColumnMapping,
        createdBy: req.session.userId!,
      });
      log.info(
        { org_id: organisationId, user_id: req.session.userId, profile_id: profile.id },
        'import_profile_created'
      );
      res.status(201).json({ profile });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/import-profiles/:id', requireRole('admin'), async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const id = req.params.id!;
      if (!UUID_RE.test(id)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const deleted = await profilesRepo.deleteProfile(pool, organisationId, id);
      if (!deleted) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      log.info(
        { org_id: organisationId, user_id: req.session.userId, profile_id: id },
        'import_profile_deleted'
      );
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
