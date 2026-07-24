import { Queryable, AssignmentRow, AssignmentState } from './types';

/**
 * Assignments repository. Every method requires organisationId; mutation
 * methods additionally scope by the acting user where the action is only
 * valid for the assignee.
 */

export interface CreateAssignmentInput {
  controlId: string;
  assigneeId: string;
  assignedBy: string;
  dueDate: string;
}

export async function createAssignment(
  db: Queryable,
  organisationId: string,
  input: CreateAssignmentInput
): Promise<AssignmentRow> {
  const result = await db.query<AssignmentRow>(
    `INSERT INTO assignments (organisation_id, control_id, assignee_id, assigned_by, due_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [organisationId, input.controlId, input.assigneeId, input.assignedBy, input.dueDate]
  );
  return result.rows[0]!;
}

export async function findAssignmentById(
  db: Queryable,
  organisationId: string,
  id: string
): Promise<AssignmentRow | null> {
  const result = await db.query<AssignmentRow>(
    'SELECT * FROM assignments WHERE organisation_id = $1 AND id = $2',
    [organisationId, id]
  );
  return result.rows[0] ?? null;
}

export async function listAssignmentsByOrganisation(
  db: Queryable,
  organisationId: string
): Promise<AssignmentRow[]> {
  const result = await db.query<AssignmentRow>(
    'SELECT * FROM assignments WHERE organisation_id = $1 ORDER BY due_date ASC',
    [organisationId]
  );
  return result.rows;
}

export async function listAssignmentsForAssignee(
  db: Queryable,
  organisationId: string,
  assigneeId: string
): Promise<AssignmentRow[]> {
  const result = await db.query<AssignmentRow>(
    `SELECT * FROM assignments
     WHERE organisation_id = $1 AND assignee_id = $2
     ORDER BY due_date ASC`,
    [organisationId, assigneeId]
  );
  return result.rows;
}

export async function listAssignmentsInState(
  db: Queryable,
  organisationId: string,
  state: AssignmentState
): Promise<AssignmentRow[]> {
  const result = await db.query<AssignmentRow>(
    `SELECT * FROM assignments
     WHERE organisation_id = $1 AND state = $2
     ORDER BY updated_at ASC`,
    [organisationId, state]
  );
  return result.rows;
}

/** Sets the evidence note. Only valid for the assignee while not yet accepted. */
export async function setEvidenceNote(
  db: Queryable,
  organisationId: string,
  id: string,
  assigneeId: string,
  evidenceNote: string
): Promise<AssignmentRow | null> {
  const result = await db.query<AssignmentRow>(
    `UPDATE assignments SET evidence_note = $4, updated_at = now()
     WHERE organisation_id = $1 AND id = $2 AND assignee_id = $3
       AND state IN ('assigned', 'rejected')
     RETURNING *`,
    [organisationId, id, assigneeId, evidenceNote]
  );
  return result.rows[0] ?? null;
}

export async function submitForReview(
  db: Queryable,
  organisationId: string,
  id: string,
  assigneeId: string
): Promise<AssignmentRow | null> {
  const result = await db.query<AssignmentRow>(
    `UPDATE assignments SET state = 'ready_for_review', updated_at = now()
     WHERE organisation_id = $1 AND id = $2 AND assignee_id = $3
       AND state IN ('assigned', 'rejected')
       AND evidence_note IS NOT NULL
     RETURNING *`,
    [organisationId, id, assigneeId]
  );
  return result.rows[0] ?? null;
}

export async function reviewAssignment(
  db: Queryable,
  organisationId: string,
  id: string,
  decision: 'accepted' | 'rejected',
  rejectionReason: string | null
): Promise<AssignmentRow | null> {
  const result = await db.query<AssignmentRow>(
    `UPDATE assignments SET state = $3, rejection_reason = $4, updated_at = now()
     WHERE organisation_id = $1 AND id = $2 AND state = 'ready_for_review'
     RETURNING *`,
    [organisationId, id, decision, rejectionReason]
  );
  return result.rows[0] ?? null;
}
