import { ReactNode } from 'react';
import { AssignmentState, ControlStatus } from '../types';

const STATUS_STYLES: Record<ControlStatus, string> = {
  pending: 'bg-slate-200 text-slate-700',
  in_review: 'bg-amber-100 text-amber-800',
  passed: 'bg-emerald-100 text-emerald-800',
  deferred: 'bg-violet-100 text-violet-800',
};

const STATUS_LABELS: Record<ControlStatus, string> = {
  pending: 'Pending',
  in_review: 'In Review',
  passed: 'Passed',
  deferred: 'Deferred',
};

export function StatusBadge({ status }: { status: ControlStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const STATE_STYLES: Record<AssignmentState, string> = {
  assigned: 'bg-slate-200 text-slate-700',
  ready_for_review: 'bg-amber-100 text-amber-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
};

const STATE_LABELS: Record<AssignmentState, string> = {
  assigned: 'Assigned',
  ready_for_review: 'Ready for review',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

export function StateBadge({ state }: { state: AssignmentState }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_STYLES[state]}`}
    >
      {STATE_LABELS[state]}
    </span>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      {title ? <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2> : null}
      {children}
    </section>
  );
}

export function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {message}
    </p>
  );
}

export function OverdueTag({ dueDate }: { dueDate: string }) {
  const overdue = dueDate < new Date().toISOString().slice(0, 10);
  if (!overdue) return null;
  return (
    <span className="ml-2 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
      Overdue
    </span>
  );
}
