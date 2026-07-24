export type Role = 'admin' | 'manager' | 'employee';
export type ControlStatus = 'pending' | 'in_review' | 'passed' | 'deferred';
export type AssignmentState = 'assigned' | 'ready_for_review' | 'accepted' | 'rejected';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  organisationId: string;
}

export interface OrgMember {
  id: string;
  displayName: string;
  email: string;
  role: Role;
}

export interface Control {
  id: string;
  organisation_id: string;
  name: string;
  description: string;
  category: string | null;
  due_date: string | null;
  status: ControlStatus;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  organisation_id: string;
  control_id: string;
  assignee_id: string;
  assigned_by: string;
  due_date: string;
  evidence_note: string | null;
  state: AssignmentState;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: string;
  organisation_id: string;
  user_id: string | null;
  action: string;
  control_id: string | null;
  created_at: string;
}

export interface EmployeeAttention {
  role: 'employee';
  openAssignments: Assignment[];
  overdue: Assignment[];
  awaitingReview: Assignment[];
}

export interface ManagerAttention {
  role: 'manager';
  readyForReview: Assignment[];
}

export interface AdminAttention {
  role: 'admin';
  statusSummary: { status: ControlStatus; count: number }[];
  openAssignmentCount: number;
  overdueCount: number;
  readyForReviewCount: number;
}

export type Attention = EmployeeAttention | ManagerAttention | AdminAttention;

/* ---------------- CSV import ---------------- */

/** Control field → CSV column header. */
export interface ColumnMapping {
  name?: string;
  description?: string;
  category?: string;
  due_date?: string;
}

export interface ImportProfile {
  id: string;
  organisation_id: string;
  name: string;
  column_mapping: ColumnMapping;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ImportRun {
  id: string;
  organisation_id: string;
  profile_id: string | null;
  filename_checksum: string;
  total_rows: number;
  accepted_rows: number;
  rejected_rows: number;
  created_by: string;
  created_at: string;
}

export interface ImportRowResult {
  id: string;
  import_run_id: string;
  row_number: number;
  row_checksum: string;
  status: 'accepted' | 'rejected';
  rejection_reason: string | null;
  control_id: string | null;
  created_at: string;
}

export interface ParseResult {
  headers: string[];
  preview: string[][];
  totalRows: number;
  filenameChecksum: string;
}

export interface DryRunResult {
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  rejections: { rowNumber: number; values: string[]; reason: string }[];
}

/* ---------------- Bounded AI review ---------------- */

export interface AiSettings {
  enabled: boolean;
  maxRequestsPerUserPerDay: number;
  maxRequestsPerOrgPerDay: number;
}

export interface AiInteraction {
  id: string;
  organisation_id: string;
  control_id: string;
  review_id: string | null;
  requested_by: string;
  requested_at: string;
  model: string;
  prompt_token_count: number;
  completion_token_count: number;
  response_type: 'cited_assessment' | 'insufficient_evidence' | 'rate_limited' | 'error';
  citations_present: boolean;
  error_code: string | null;
}

export type AiReviewResult =
  | { type: 'cited_assessment'; assessment: string }
  | { type: 'insufficient_evidence'; message: string };
