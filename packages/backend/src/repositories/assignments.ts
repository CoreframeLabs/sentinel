import { Queryable, AssignmentRow, AssignmentState, EvidenceMethod } from './types';

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

/**
 * The review record an AI review reads from: the most recently updated
 * assignment for the control that carries an evidence note. Organisation-
 * scoped — a control from another organisation yields null, indistinguishable
 * from "no evidence".
 */
export async function findLatestEvidenceForControl(
  db: Queryable,
  organisationId: string,
  controlId: string
): Promise<AssignmentRow | null> {
  const result = await db.query<AssignmentRow>(
    `SELECT * FROM assignments
     WHERE organisation_id = $1 AND control_id = $2 AND evidence_note IS NOT NULL
     ORDER BY updated_at DESC
     LIMIT 1`,
    [organisationId, controlId]
  );
  return result.rows[0] ?? null;
}

export interface SetEvidenceInput {
  summary: string;
  method?: EvidenceMethod | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  sampleSize?: number | null;
  population?: number | null;
  location?: string | null;
}

/**
 * Sets the evidence record: the narrative summary plus the structured fields
 * around it. Only valid for the assignee while not yet accepted. Structured
 * fields are always written (as NULL when omitted) so a revision cannot leave
 * stale values from a previous submission attached to new evidence.
 */
export async function setEvidence(
  db: Queryable,
  organisationId: string,
  id: string,
  assigneeId: string,
  evidence: SetEvidenceInput
): Promise<AssignmentRow | null> {
  const result = await db.query<AssignmentRow>(
    `UPDATE assignments SET
       evidence_note = $4,
       evidence_method = $5,
       evidence_period_start = $6,
       evidence_period_end = $7,
       evidence_sample_size = $8,
       evidence_population = $9,
       evidence_location = $10,
       updated_at = now()
     WHERE organisation_id = $1 AND id = $2 AND assignee_id = $3
       AND state IN ('assigned', 'rejected')
     RETURNING *`,
    [
      organisationId,
      id,
      assigneeId,
      evidence.summary,
      evidence.method ?? null,
      evidence.periodStart ?? null,
      evidence.periodEnd ?? null,
      evidence.sampleSize ?? null,
      evidence.population ?? null,
      evidence.location ?? null,
    ]
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
