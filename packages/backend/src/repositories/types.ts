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
  category: string | null;
  due_date: string | null;
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
  import_run_id: string | null;
  created_at: Date;
}

/** Column-to-field mapping: control field name → CSV column header. */
export interface CsvColumnMapping {
  name: string;
  description?: string;
  category?: string;
  due_date?: string;
}

export interface CsvImportProfileRow {
  id: string;
  organisation_id: string;
  name: string;
  column_mapping: CsvColumnMapping;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface CsvImportRunRow {
  id: string;
  organisation_id: string;
  profile_id: string | null;
  filename_checksum: string;
  total_rows: number;
  accepted_rows: number;
  rejected_rows: number;
  created_by: string;
  created_at: Date;
}

export type CsvImportRowStatus = 'accepted' | 'rejected';

export interface CsvImportRowResultRow {
  id: string;
  import_run_id: string;
  row_number: number;
  row_checksum: string;
  status: CsvImportRowStatus;
  rejection_reason: string | null;
  control_id: string | null;
  created_at: Date;
}

export interface AiFeatureSettingsRow {
  id: string;
  organisation_id: string;
  enabled: boolean;
  max_requests_per_user_per_day: number;
  max_requests_per_org_per_day: number;
  enabled_by: string | null;
  enabled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type AiResponseType = 'cited_assessment' | 'insufficient_evidence' | 'rate_limited' | 'error';

export interface AiInteractionRow {
  id: string;
  organisation_id: string;
  control_id: string;
  review_id: string | null;
  requested_by: string;
  requested_at: Date;
  model: string;
  prompt_token_count: number;
  completion_token_count: number;
  response_type: AiResponseType;
  citations_present: boolean;
  error_code: string | null;
  created_at: Date;
}
