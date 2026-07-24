import { Queryable, CsvColumnMapping, CsvImportProfileRow } from './types';

/**
 * Saved CSV column-mapping profiles. Every method requires organisationId and
 * scopes on it — a profile belonging to another organisation resolves to null
 * (read) or no-op (delete), surfacing as 404 in the route layer.
 */

export async function createProfile(
  db: Queryable,
  organisationId: string,
  input: { name: string; columnMapping: CsvColumnMapping; createdBy: string }
): Promise<CsvImportProfileRow> {
  const result = await db.query<CsvImportProfileRow>(
    `INSERT INTO csv_import_profiles (organisation_id, name, column_mapping, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [organisationId, input.name, JSON.stringify(input.columnMapping), input.createdBy]
  );
  return result.rows[0]!;
}

export async function listProfiles(
  db: Queryable,
  organisationId: string
): Promise<CsvImportProfileRow[]> {
  const result = await db.query<CsvImportProfileRow>(
    'SELECT * FROM csv_import_profiles WHERE organisation_id = $1 ORDER BY created_at ASC',
    [organisationId]
  );
  return result.rows;
}

export async function findProfileById(
  db: Queryable,
  organisationId: string,
  id: string
): Promise<CsvImportProfileRow | null> {
  const result = await db.query<CsvImportProfileRow>(
    'SELECT * FROM csv_import_profiles WHERE organisation_id = $1 AND id = $2',
    [organisationId, id]
  );
  return result.rows[0] ?? null;
}

/** Returns true when a row was deleted; false when no organisation-scoped
 * match existed. */
export async function deleteProfile(
  db: Queryable,
  organisationId: string,
  id: string
): Promise<boolean> {
  const result = await db.query(
    'DELETE FROM csv_import_profiles WHERE organisation_id = $1 AND id = $2',
    [organisationId, id]
  );
  return (result.rowCount ?? 0) > 0;
}
