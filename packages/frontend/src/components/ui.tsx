import { ButtonHTMLAttributes, ReactNode, useEffect } from 'react';
import { LucideIcon, X } from 'lucide-react';
import { AssignmentState, ControlStatus } from '../types';

/* ------------------------------------------------------------------ */
/* Status + state presentation                                         */
/*                                                                     */
/* Mark colors for the distribution bar are the validated status       */
/* palette (dataviz six-checks, light surface): passed #059669,        */
/* in_review #d97706, pending #0284c7, deferred #7c3aed. Badges use    */
/* tinted backgrounds of the same hues; identity is never color-alone  */
/* — every use ships a text label.                                     */
/* ------------------------------------------------------------------ */

export const STATUS_META: Record<
  ControlStatus,
  { label: string; badge: string; dot: string; bar: string }
> = {
  pending: {
    label: 'Pending',
    badge: 'bg-sky-50 text-sky-800 ring-sky-600/20',
    dot: 'bg-sky-600',
    bar: '#0284c7',
  },
  in_review: {
    label: 'In Review',
    badge: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    dot: 'bg-amber-600',
    bar: '#d97706',
  },
  passed: {
    label: 'Passed',
    badge: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
    dot: 'bg-emerald-600',
    bar: '#059669',
  },
  deferred: {
    label: 'Deferred',
    badge: 'bg-violet-50 text-violet-800 ring-violet-600/20',
    dot: 'bg-violet-600',
    bar: '#7c3aed',
  },
};

export const STATE_META: Record<AssignmentState, { label: string; badge: string; dot: string }> = {
  assigned: {
    label: 'Assigned',
    badge: 'bg-slate-100 text-slate-700 ring-slate-600/20',
    dot: 'bg-slate-500',
  },
  ready_for_review: {
    label: 'Ready for review',
    badge: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    dot: 'bg-amber-600',
  },
  accepted: {
    label: 'Accepted',
    badge: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
    dot: 'bg-emerald-600',
  },
  rejected: {
    label: 'Rejected',
    badge: 'bg-rose-50 text-rose-800 ring-rose-600/20',
    dot: 'bg-rose-600',
  },
};

export function StatusBadge({ status }: { status: ControlStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${meta.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function StateBadge({ state }: { state: AssignmentState }) {
  const meta = STATE_META[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${meta.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function DueChip({ dueDate, label }: { dueDate: string; label: string }) {
  const overdue = dueDate < new Date().toISOString().slice(0, 10);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        overdue
          ? 'bg-rose-50 text-rose-800 ring-rose-600/20'
          : 'bg-slate-100 text-slate-600 ring-slate-600/10'
      }`}
    >
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Layout primitives                                                   */
/* ------------------------------------------------------------------ */

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      {title || action ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? (
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md';
}

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:outline-indigo-600 shadow-sm',
  secondary:
    'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 focus-visible:outline-rose-600 shadow-sm',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:outline-emerald-600 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:outline-slate-400',
};

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-45 ${
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
      } ${BUTTON_VARIANTS[variant]} ${className}`}
    />
  );
}

export const inputClass =
  'w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600';

export function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="rounded-full bg-slate-100 p-3">
        <Icon className="h-6 w-6 text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
    >
      {message}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fade-in fixed inset-0 z-40 flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh]">
      <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="modal-enter relative w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <Button variant="ghost" size="sm" aria-label="Close dialog" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard visuals                                                   */
/* ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: 'default' | 'alert';
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className={`rounded-lg p-2.5 ${tone === 'alert' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-tight text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}

const BAR_ORDER: ControlStatus[] = ['passed', 'in_review', 'pending', 'deferred'];

/**
 * Single stacked distribution bar for control statuses. 2px surface gaps
 * between segments and a labelled legend with counts provide the secondary
 * encoding; values live in text ink, never in the mark color.
 */
export function StatusDistribution({ counts }: { counts: Record<string, number> }) {
  const total = BAR_ORDER.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  if (total === 0) {
    return <p className="text-sm text-slate-500">No controls yet.</p>;
  }
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {BAR_ORDER.filter((s) => (counts[s] ?? 0) > 0).map((status) => (
          <div
            key={status}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${((counts[status] ?? 0) / total) * 100}%`,
              backgroundColor: STATUS_META[status].bar,
            }}
            title={`${STATUS_META[status].label}: ${counts[status]}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {BAR_ORDER.map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: STATUS_META[status].bar }}
            />
            {STATUS_META[status].label}
            <span className="font-semibold text-slate-900">{counts[status] ?? 0}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
