import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlarmClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Hourglass,
  Inbox,
  PartyPopper,
} from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/toast';
import { Assignment, Attention, AuditEntry, Control } from '../types';
import {
  Button,
  Card,
  DueChip,
  EmptyState,
  inputClass,
  PageHeader,
  StatCard,
  StateBadge,
  StatusDistribution,
} from '../components/ui';
import { auditLabel, dueLabel, timeAgo } from '../lib/format';

function useControls(refresh: number) {
  const [controls, setControls] = useState<Control[]>([]);
  useEffect(() => {
    void api<{ controls: Control[] }>('/api/controls').then((res) => setControls(res.controls));
  }, [refresh]);
  return controls;
}

/* ------------------------------------------------------------------ */
/* Employee                                                            */
/* ------------------------------------------------------------------ */

function EmployeeDashboard({
  attention,
  controls,
  onChanged,
}: {
  attention: Extract<Attention, { role: 'employee' }>;
  controls: Control[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const controlName = (id: string) => controls.find((c) => c.id === id)?.name ?? 'Control';

  const run = async (assignment: Assignment, action: 'save' | 'submit') => {
    setBusyId(assignment.id);
    try {
      if (action === 'save') {
        await api(`/api/assignments/${assignment.id}/evidence`, {
          method: 'POST',
          body: { evidenceNote: notes[assignment.id] ?? '' },
        });
        toast.success('Evidence saved.');
      } else {
        await api(`/api/assignments/${assignment.id}/submit`, { method: 'POST' });
        toast.success('Submitted for review.');
      }
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  const open = attention.openAssignments;

  return (
    <div className="fade-in space-y-6">
      <PageHeader
        title="Your work"
        subtitle={
          open.length === 0
            ? 'Nothing needs your action right now.'
            : `${open.length} control${open.length === 1 ? '' : 's'} need${open.length === 1 ? 's' : ''} your attention${attention.overdue.length ? ` — ${attention.overdue.length} overdue` : ''}.`
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open" value={open.length} icon={ClipboardList} />
        <StatCard
          label="Overdue"
          value={attention.overdue.length}
          icon={AlarmClock}
          tone={attention.overdue.length > 0 ? 'alert' : 'default'}
        />
        <StatCard label="Awaiting review" value={attention.awaitingReview.length} icon={Hourglass} />
      </div>

      <Card title="Needs your action">
        {open.length === 0 ? (
          <EmptyState
            icon={PartyPopper}
            title="All caught up"
            hint="New assignments from your manager will appear here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {open.map((a) => (
              <li key={a.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link
                      to={`/controls/${a.control_id}`}
                      className="font-semibold text-slate-900 hover:text-indigo-600"
                    >
                      {controlName(a.control_id)}
                    </Link>
                    {a.state === 'rejected' && a.rejection_reason ? (
                      <p className="mt-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
                        Returned by your manager: {a.rejection_reason}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <DueChip dueDate={a.due_date} label={dueLabel(a.due_date)} />
                    <StateBadge state={a.state} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    aria-label="Evidence note"
                    placeholder={a.evidence_note ?? 'Describe the evidence for this control…'}
                    className={`${inputClass} min-w-52 flex-1`}
                    value={notes[a.id] ?? ''}
                    onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                  />
                  <Button
                    variant="secondary"
                    disabled={busyId === a.id || !(notes[a.id] ?? '').trim()}
                    onClick={() => void run(a, 'save')}
                  >
                    Save evidence
                  </Button>
                  <Button
                    disabled={busyId === a.id || (!a.evidence_note && !(notes[a.id] ?? '').trim())}
                    onClick={() => void run(a, 'submit')}
                  >
                    Submit for review
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Waiting on your manager">
        {attention.awaitingReview.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing awaiting review.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {attention.awaitingReview.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <Link
                  to={`/controls/${a.control_id}`}
                  className="text-sm font-medium text-slate-800 hover:text-indigo-600"
                >
                  {controlName(a.control_id)}
                </Link>
                <StateBadge state={a.state} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Manager                                                             */
/* ------------------------------------------------------------------ */

function ManagerDashboard({
  attention,
  controls,
  onChanged,
}: {
  attention: Extract<Attention, { role: 'manager' }>;
  controls: Control[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const controlName = (id: string) => controls.find((c) => c.id === id)?.name ?? 'Control';
  const queue = attention.readyForReview;

  const review = async (assignment: Assignment, decision: 'accept' | 'reject') => {
    setBusyId(assignment.id);
    try {
      await api(`/api/assignments/${assignment.id}/review`, {
        method: 'POST',
        body: { decision, reason: reasons[assignment.id] },
      });
      toast.success(decision === 'accept' ? 'Submission accepted.' : 'Submission returned.');
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fade-in space-y-6">
      <PageHeader
        title="Review queue"
        subtitle={
          queue.length === 0
            ? 'No submissions waiting for you.'
            : `${queue.length} submission${queue.length === 1 ? '' : 's'} waiting for your decision.`
        }
      />

      <Card title="Ready for your review">
        {queue.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Queue is clear"
            hint="When an employee submits evidence, it lands here for your accept/reject decision."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {queue.map((a) => (
              <li key={a.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to={`/controls/${a.control_id}`}
                    className="font-semibold text-slate-900 hover:text-indigo-600"
                  >
                    {controlName(a.control_id)}
                  </Link>
                  <div className="flex items-center gap-2">
                    <DueChip dueDate={a.due_date} label={dueLabel(a.due_date)} />
                    <StateBadge state={a.state} />
                  </div>
                </div>
                <blockquote className="rounded-lg border-l-2 border-indigo-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
                  {a.evidence_note}
                </blockquote>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="success"
                    disabled={busyId === a.id}
                    onClick={() => void review(a, 'accept')}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Accept
                  </Button>
                  <input
                    type="text"
                    aria-label="Rejection reason"
                    placeholder="Reason (required to reject)…"
                    className={`${inputClass} min-w-52 flex-1`}
                    value={reasons[a.id] ?? ''}
                    onChange={(e) => setReasons({ ...reasons, [a.id]: e.target.value })}
                  />
                  <Button
                    variant="danger"
                    disabled={busyId === a.id || !(reasons[a.id] ?? '').trim()}
                    onClick={() => void review(a, 'reject')}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

function AdminDashboard({
  attention,
}: {
  attention: Extract<Attention, { role: 'admin' }>;
}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  useEffect(() => {
    void api<{ entries: AuditEntry[] }>('/api/audit').then((res) =>
      setEntries(res.entries.slice(0, 8))
    );
  }, []);

  const counts = Object.fromEntries(attention.statusSummary.map((s) => [s.status, s.count]));
  const total = attention.statusSummary.reduce((sum, s) => sum + s.count, 0);
  const passed = counts.passed ?? 0;
  const score = total === 0 ? 0 : Math.round((passed / total) * 100);

  return (
    <div className="fade-in space-y-6">
      <PageHeader
        title="Organisation overview"
        subtitle="Compliance posture across your whole team."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Controls passed" value={`${score}%`} icon={ClipboardCheck} />
        <StatCard label="Open assignments" value={attention.openAssignmentCount} icon={ClipboardList} />
        <StatCard
          label="Overdue"
          value={attention.overdueCount}
          icon={AlarmClock}
          tone={attention.overdueCount > 0 ? 'alert' : 'default'}
        />
        <StatCard label="Ready for review" value={attention.readyForReviewCount} icon={Hourglass} />
      </div>

      <Card
        title={`Controls by status (${total})`}
        action={
          <Link to="/controls" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            View all →
          </Link>
        }
      >
        <StatusDistribution counts={counts} />
      </Card>

      <Card
        title="Recent activity"
        action={
          <Link to="/audit" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            Full audit log →
          </Link>
        }
      >
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 text-sm">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                <span className="font-medium text-slate-800">{auditLabel(entry.action)}</span>
                {entry.control_id ? (
                  <Link
                    to={`/controls/${entry.control_id}`}
                    className="truncate font-mono text-xs text-slate-400 hover:text-indigo-600"
                  >
                    {entry.control_id.slice(0, 8)}
                  </Link>
                ) : null}
                <span className="ml-auto shrink-0 text-xs text-slate-400">
                  {timeAgo(entry.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function DashboardPage() {
  const { user } = useAuth();
  const [attention, setAttention] = useState<Attention | null>(null);
  const [refresh, setRefresh] = useState(0);
  const controls = useControls(refresh);
  const onChanged = useCallback(() => setRefresh((n) => n + 1), []);

  useEffect(() => {
    void api<Attention>('/api/attention').then(setAttention);
  }, [refresh]);

  if (!attention || !user) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  switch (attention.role) {
    case 'employee':
      return <EmployeeDashboard attention={attention} controls={controls} onChanged={onChanged} />;
    case 'manager':
      return <ManagerDashboard attention={attention} controls={controls} onChanged={onChanged} />;
    case 'admin':
      return <AdminDashboard attention={attention} />;
  }
}
