import { Queryable, CsvImportRowResultRow, CsvImportRowStatus, CsvImportRunRow } from './types';

/**
 * CSV import provenance repository. Append and read only — csv_import_runs
 * and csv_import_row_results carry database triggers (migration 0004) that
 * reject UPDATE and DELETE, so there are intentionally no mutation methods.
 *
 * Runs are organisation-scoped directly; row results are scoped through
 * their run's organisation_id via a join — a result row is never readable
 * outside the organisation that owns its run.
 */

export async function createImportRun(
  db: Queryable,
  organisationId: string,
  input: {
    profileId: string | null;
    filenameChecksum: string;
    totalRows: number;
    acceptedRows: number;
    rejectedRows: number;
    createdBy: string;
  }
): Promise<CsvImportRunRow> {
  const result = await db.query<CsvImportRunRow>(
    `INSERT INTO csv_import_runs
       (organisation_id, profile_id, filename_checksum, total_rows, accepted_rows, rejected_rows, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      organisationId,
      input.profileId,
      input.filenameChecksum,
      input.totalRows,
      input.acceptedRows,
      input.rejectedRows,
      input.createdBy,
    ]
  );
  return result.rows[0]!;
}

export async function appendRowResult(
  db: Queryable,
  input: {
    importRunId: string;
    rowNumber: number;
    rowChecksum: string;
    status: CsvImportRowStatus;
    rejectionReason: string | null;
    controlId: string | null;
  }
): Promise<CsvImportRowResultRow> {
  const result = await db.query<CsvImportRowResultRow>(
    `INSERT INTO csv_import_row_results
       (import_run_id, row_number, row_checksum, status, rejection_reason, control_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.importRunId,
      input.rowNumber,
      input.rowChecksum,
      input.status,
      input.rejectionReason,
      input.controlId,
    ]
  );
  return result.rows[0]!;
}

export async function listImportRuns(
  db: Queryable,
  organisationId: string
): Promise<CsvImportRunRow[]> {
  const result = await db.query<CsvImportRunRow>(
    `SELECT * FROM csv_import_runs
     WHERE organisation_id = $1
     ORDER BY created_at DESC`,
    [organisationId]
  );
  return result.rows;
}

export async function findImportRunById(
  db: Queryable,
  organisationId: string,
  id: string
): Promise<CsvImportRunRow | null> {
  const result = await db.query<CsvImportRunRow>(
    'SELECT * FROM csv_import_runs WHERE organisation_id = $1 AND id = $2',
    [organisationId, id]
  );
  return result.rows[0] ?? null;
}

export async function listRowResultsForRun(
  db: Queryable,
  organisationId: string,
  importRunId: string
): Promise<CsvImportRowResultRow[]> {
  const result = await db.query<CsvImportRowResultRow>(
    `SELECT r.* FROM csv_import_row_results r
     JOIN csv_import_runs run ON run.id = r.import_run_id
     WHERE run.organisation_id = $1 AND r.import_run_id = $2
     ORDER BY r.row_number ASC`,
    [organisationId, importRunId]
  );
  return result.rows;
}
