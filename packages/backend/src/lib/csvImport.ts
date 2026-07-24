import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import { CsvColumnMapping } from '../repositories/types';

/**
 * CSV import parsing and validation. Everything here is pure and operates on
 * in-memory data: the uploaded file is never written to disk or stored — only
 * checksums and row-level outcomes are persisted by the caller.
 *
 * Validation runs identically for the dry run and the confirmation step: the
 * confirmation endpoint re-validates every row from the re-submitted file and
 * never trusts a client-supplied "these rows passed" list.
 */

export const CSV_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const CSV_ALLOWED_MIME_TYPES = ['text/csv', 'application/csv'];
export const CSV_PREVIEW_ROW_COUNT = 5;
export const CONTROL_NAME_MAX_LENGTH = 255;

export const MAPPABLE_FIELDS = ['name', 'description', 'category', 'due_date'] as const;
export type MappableField = (typeof MAPPABLE_FIELDS)[number];

export class CsvParseError extends Error {}
export class CsvMappingError extends Error {}

export interface ParsedCsv {
  headers: string[];
  /** Data rows (header row excluded), in file order. */
  rows: string[][];
}

/** SHA-256 hex checksum of the uploaded file, byte-for-byte. */
export function fileChecksum(file: Buffer): string {
  return crypto.createHash('sha256').update(file).digest('hex');
}

/**
 * SHA-256 hex checksum of one raw CSV row: the parsed cell values joined by
 * comma, before any mapping or transformation. Stored per row so a stored
 * result can later be verified against the original row.
 */
export function rowChecksum(values: string[]): string {
  return crypto.createHash('sha256').update(values.join(',')).digest('hex');
}

export function parseCsv(file: Buffer): ParsedCsv {
  let records: string[][];
  try {
    records = parse(file, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][];
  } catch (err) {
    throw new CsvParseError(err instanceof Error ? err.message : 'CSV could not be parsed');
  }
  if (records.length === 0) {
    throw new CsvParseError('CSV file is empty');
  }
  const headers = records[0]!.map((h) => h.trim());
  if (headers.every((h) => h === '')) {
    throw new CsvParseError('CSV header row is empty');
  }
  return { headers, rows: records.slice(1) };
}

/**
 * Validates the column mapping against the CSV headers. `name` is mandatory;
 * every mapped column must actually exist in the file. Throws CsvMappingError
 * with a human-readable message.
 */
export function resolveMapping(
  headers: string[],
  mapping: CsvColumnMapping
): Record<MappableField, number | null> {
  if (typeof mapping !== 'object' || mapping === null || typeof mapping.name !== 'string') {
    throw new CsvMappingError('mapping.name is required: the "name" field must be mapped to a CSV column');
  }
  const resolved: Record<MappableField, number | null> = {
    name: null,
    description: null,
    category: null,
    due_date: null,
  };
  for (const field of MAPPABLE_FIELDS) {
    const header = mapping[field];
    if (header === undefined || header === null || header === '') continue;
    if (typeof header !== 'string') {
      throw new CsvMappingError(`mapping.${field} must be a CSV column header string`);
    }
    const index = headers.indexOf(header.trim());
    if (index === -1) {
      throw new CsvMappingError(`mapping.${field} refers to a column that is not in the CSV file`);
    }
    resolved[field] = index;
  }
  return resolved;
}

export interface ValidatedRow {
  /** 1-based data row number (first row after the header is row 1). */
  rowNumber: number;
  /** Original CSV cell values, untransformed. */
  values: string[];
  checksum: string;
  status: 'accepted' | 'rejected';
  rejectionReason: string | null;
  /** Mapped control fields — present only for accepted rows. */
  control: { name: string; description: string; category: string | null; dueDate: string | null } | null;
}

export interface ValidationSummary {
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  rows: ValidatedRow[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day
  );
}

/**
 * Validates every data row against the control schema. Nothing is silently
 * discarded: each row comes back as accepted (with the mapped control fields)
 * or rejected with a specific reason.
 *
 * `today` is the ISO calendar date used for the "due date must be in the
 * future" rule; injectable for deterministic tests.
 */
export function validateRows(
  parsed: ParsedCsv,
  mapping: CsvColumnMapping,
  today: string = new Date().toISOString().slice(0, 10)
): ValidationSummary {
  const columns = resolveMapping(parsed.headers, mapping);
  const rows: ValidatedRow[] = [];
  let acceptedRows = 0;

  parsed.rows.forEach((values, i) => {
    const rowNumber = i + 1;
    const checksum = rowChecksum(values);
    const cell = (index: number | null) => (index === null ? '' : (values[index] ?? '').trim());

    const reject = (rejectionReason: string) => {
      rows.push({ rowNumber, values, checksum, status: 'rejected', rejectionReason, control: null });
    };

    if (columns.name !== null && values.length <= columns.name) {
      reject('row has fewer columns than the mapped "name" column');
      return;
    }
    const name = cell(columns.name);
    if (name === '') {
      reject('name is empty');
      return;
    }
    if (name.length > CONTROL_NAME_MAX_LENGTH) {
      reject(`name exceeds ${CONTROL_NAME_MAX_LENGTH} characters`);
      return;
    }

    const dueDateRaw = cell(columns.due_date);
    let dueDate: string | null = null;
    if (dueDateRaw !== '') {
      if (!DATE_RE.test(dueDateRaw) || !isRealCalendarDate(dueDateRaw)) {
        reject('due_date is not a valid date (expected YYYY-MM-DD)');
        return;
      }
      if (dueDateRaw <= today) {
        reject('due_date is not a future date');
        return;
      }
      dueDate = dueDateRaw;
    }

    acceptedRows += 1;
    rows.push({
      rowNumber,
      values,
      checksum,
      status: 'accepted',
      rejectionReason: null,
      control: {
        name,
        description: cell(columns.description),
        category: cell(columns.category) || null,
        dueDate,
      },
    });
  });

  return {
    totalRows: parsed.rows.length,
    acceptedRows,
    rejectedRows: parsed.rows.length - acceptedRows,
    rows,
  };
}
