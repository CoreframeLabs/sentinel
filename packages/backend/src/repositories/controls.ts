import { Queryable, ControlRow, ControlStatus } from './types';

/**
 * Controls repository. Every method requires organisationId and includes
 * WHERE organisation_id = $n in its query — organisation isolation is
 * enforced here, not in route handlers.
 */

export async function createControl(
  db: Queryable,
  organisationId: string,
  input: { name: string; description: string; category?: string | null; dueDate?: string | null }
): Promise<ControlRow> {
  const result = await db.query<ControlRow>(
    `INSERT INTO controls (organisation_id, name, description, category, due_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [organisationId, input.name, input.description, input.category ?? null, input.dueDate ?? null]
  );
  return result.rows[0]!;
}

export async function listControls(db: Queryable, organisationId: string): Promise<ControlRow[]> {
  const result = await db.query<ControlRow>(
    'SELECT * FROM controls WHERE organisation_id = $1 ORDER BY created_at ASC',
    [organisationId]
  );
  return result.rows;
}

export async function findControlById(
  db: Queryable,
  organisationId: string,
  id: string
): Promise<ControlRow | null> {
  const result = await db.query<ControlRow>(
    'SELECT * FROM controls WHERE organisation_id = $1 AND id = $2',
    [organisationId, id]
  );
  return result.rows[0] ?? null;
}

export async function updateControlStatus(
  db: Queryable,
  organisationId: string,
  id: string,
  status: ControlStatus
): Promise<ControlRow | null> {
  const result = await db.query<ControlRow>(
    `UPDATE controls SET status = $3, updated_at = now()
     WHERE organisation_id = $1 AND id = $2
     RETURNING *`,
    [organisationId, id, status]
  );
  return result.rows[0] ?? null;
}

export interface ControlStatusSummary {
  status: string;
  count: number;
}

export async function summarizeControlStatuses(
  db: Queryable,
  organisationId: string
): Promise<ControlStatusSummary[]> {
  const result = await db.query<{ status: string; count: string }>(
    `SELECT status, count(*)::text AS count
     FROM controls WHERE organisation_id = $1
     GROUP BY status`,
    [organisationId]
  );
  return result.rows.map((r) => ({ status: r.status, count: Number(r.count) }));
}
