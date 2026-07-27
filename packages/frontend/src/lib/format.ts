/** Date/label helpers shared across pages. */

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isOverdue(dueDate: string): boolean {
  return dueDate < todayISO();
}

/** "Due today" / "Due in 3 days" / "4 days overdue". */
export function dueLabel(dueDate: string): string {
  const due = new Date(`${dueDate}T00:00:00Z`);
  const today = new Date(`${todayISO()}T00:00:00Z`);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  if (days === -1) return '1 day overdue';
  return `${-days} days overdue`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "just now" / "12 min ago" / "3 h ago" / "2 days ago" / date. */
export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)} days ago`;
  return formatDate(iso);
}

const AUDIT_LABELS: Record<string, string> = {
  organisation_created: 'Organisation created',
  user_joined: 'Team member joined',
  control_created: 'Control created',
  control_assigned: 'Control assigned',
  evidence_added: 'Evidence recorded',
  submitted_for_review: 'Submitted for review',
  review_accepted: 'Review accepted',
  review_rejected: 'Review rejected',
  control_status_pending: 'Status set to Pending',
  control_status_in_review: 'Status set to In Review',
  control_status_passed: 'Status set to Passed',
  control_status_deferred: 'Status set to Deferred',
  import_run_created: 'CSV import run',
  control_created_by_import: 'Control created by import',
  ai_review_completed: 'AI evidence review run',
  ai_feature_enabled: 'AI review enabled',
  ai_feature_disabled: 'AI review disabled',
};

export function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action.replaceAll('_', ' ');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}
