import { Pool, PoolClient } from 'pg';

/**
 * Repositories accept either the shared pool or a transaction client, so the
 * same method works standalone and inside withTransaction.
 */
export type Queryable = Pool | PoolClient;

export type Role = 'admin' | 'manager' | 'employee';
export type ControlStatus = 'pending' | 'in_review' | 'passed' | 'deferred';
export type AssignmentState = 'assigned' | 'ready_for_review' | 'accepted' | 'rejected';

export interface OrganisationRow {
  id: string;
  name: string;
  created_at: Date;
}

export interface UserRow {
  id: string;
  organisation_id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: Role;
  created_at: Date;
}

export interface ControlRow {
  id: string;
  organisation_id: string;
  name: string;
  description: string;
  status: ControlStatus;
  created_at: Date;
  updated_at: Date;
}

export interface AssignmentRow {
  id: string;
  organisation_id: string;
  control_id: string;
  assignee_id: string;
  assigned_by: string;
  due_date: string;
  evidence_note: string | null;
  state: AssignmentState;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface InvitationRow {
  id: string;
  organisation_id: string;
  email: string;
  role: Role;
  selector: string;
  verifier_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_by: string;
  created_at: Date;
}

export interface AuditLogRow {
  id: string;
  organisation_id: string;
  user_id: string | null;
  action: string;
  control_id: string | null;
  created_at: Date;
}
