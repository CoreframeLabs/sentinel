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
