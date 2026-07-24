import { Queryable, AuditLogRow } from './types';

/**
 * Audit log repository. Append and read only — there are intentionally no
 * update or delete methods, and the database trigger
 * (migrations/0003_audit-append-only.js) rejects them anyway.
 *
 * Entries hold identifiers only: user_id, not names; control_id, not control
 * names; an action verb, never content the user typed.
 */

export async function appendAuditEntry(
  db: Queryable,
  organisationId: string,
  entry: { userId: string | null; action: string; controlId: string | null }
): Promise<AuditLogRow> {
  const result = await db.query<AuditLogRow>(
    `INSERT INTO audit_log (organisation_id, user_id, action, control_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [organisationId, entry.userId, entry.action, entry.controlId]
  );
  return result.rows[0]!;
}

export async function listAuditEntries(
  db: Queryable,
  organisationId: string,
  limit = 200
): Promise<AuditLogRow[]> {
  const result = await db.query<AuditLogRow>(
    `SELECT * FROM audit_log
     WHERE organisation_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [organisationId, limit]
  );
  return result.rows;
}
