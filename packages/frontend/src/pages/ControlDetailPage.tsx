import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Sparkles, UserPlus } from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/toast';
import { AiReviewResult, Assignment, Control, ControlStatus, OrgMember } from '../types';
import {
  Button,
  Card,
  DueChip,
  EmptyState,
  inputClass,
  STATUS_META,
  StateBadge,
  StatusBadge,
} from '../components/ui';
import { dueLabel, formatDate, initials } from '../lib/format';

const ALL_STATUSES: ControlStatus[] = ['pending', 'in_review', 'passed', 'deferred'];

export function ControlDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const [control, setControl] = useState<Control | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const canAssign = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
    if (!id) return;
    api<{ control: Control; assignments: Assignment[] }>(`/api/controls/${id}`)
      .then((res) => {
        setControl(res.control);
        setAssignments(res.assignments);
      })
      .catch(() => setNotFound(true));
  }, [id, refresh]);

  useEffect(() => {
    if (canAssign) {
      void api<{ users: OrgMember[] }>('/api/users').then((res) => setMembers(res.users));
    }
  }, [canAssign]);

  if (notFound) {
    return (
      <div className="fade-in">
        <BackLink />
        <Card>
          <EmptyState icon={ClipboardList} title="Control not found" />
        </Card>
      </div>
    );
  }
  if (!control) return <p className="text-sm text-slate-500">Loading…</p>;

  const changeStatus = async (status: ControlStatus) => {
    setBusy(true);
    try {
      await api(`/api/controls/${control.id}/status`, { method: 'PATCH', body: { status } });
      toast.success(`Status set to ${STATUS_META[status].label}.`);
      setRefresh((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const assign = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/assignments', {
        method: 'POST',
        body: { controlId: control.id, assigneeId, dueDate },
      });
      toast.success('Control assigned.');
      setAssigneeId('');
      setDueDate('');
      setRefresh((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const member = (memberId: string) => members.find((m) => m.id === memberId);

  return (
    <div className="fade-in space-y-6">
      <BackLink />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{control.name}</h1>
            {control.description ? (
              <p className="mt-1.5 max-w-2xl text-sm text-slate-600">{control.description}</p>
            ) : null}
            <p className="mt-2 text-xs text-slate-400">
              Created {formatDate(control.created_at)} · Updated {formatDate(control.updated_at)}
            </p>
          </div>
          <StatusBadge status={control.status} />
        </div>
        {user?.role === 'admin' ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Set status
            </span>
            {ALL_STATUSES.map((status) => (
              <Button
                key={status}
                variant="secondary"
                size="sm"
                disabled={busy || status === control.status}
                onClick={() => void changeStatus(status)}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[status].dot}`} />
                {STATUS_META[status].label}
              </Button>
            ))}
          </div>
        ) : null}
      </Card>

      {canAssign ? (
        <Card
          title="Assign this control"
          info={
            <p>
              Pick a team member and a due date. The assignee sees it on their dashboard,
              records an evidence note, and submits it for review; the control moves to In
              Review. A control can be assigned to several people.
            </p>
          }
        >
          <form onSubmit={(e) => void assign(e)} className="flex flex-wrap items-end gap-3">
            <label className="min-w-52 flex-1 text-sm">
              <span className="font-medium text-slate-700">Assignee</span>
              <select
                required
                className={`mt-1.5 ${inputClass}`}
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">Select a team member…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName} ({m.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-700">Due date</span>
              <input
                type="date"
                required
                className={`mt-1.5 ${inputClass}`}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
            <Button type="submit" disabled={busy || !assigneeId || !dueDate}>
              <UserPlus className="h-4 w-4" /> Assign
            </Button>
          </form>
        </Card>
      ) : null}

      {user?.role === 'manager' ? (
        <AiReviewCard
          controlId={control.id}
          hasEvidence={assignments.some((a) => a.evidence_note)}
        />
      ) : null}

      <Card
        title={`Assignments (${assignments.length})`}
        infoTitle="Assignments"
        info={
          <p>
            Everyone this control is assigned to, with due date, current state and their
            submitted evidence. Rejected submissions show the reviewer&rsquo;s reason; the
            assignee can revise and resubmit until the evidence is accepted.
          </p>
        }
      >
        {assignments.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Not assigned yet"
            hint={
              canAssign
                ? 'Assign this control to a team member with a due date.'
                : 'A manager can assign this control with a due date.'
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {assignments.map((a) => {
              const assignee = member(a.assignee_id);
              return (
                <li key={a.id} className="flex items-start gap-3.5 py-4 first:pt-0 last:pb-0">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                    {assignee ? initials(assignee.displayName) : '·'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {assignee?.displayName ?? `Member ${a.assignee_id.slice(0, 8)}`}
                      </p>
                      <div className="flex items-center gap-2">
                        <DueChip dueDate={a.due_date} label={dueLabel(a.due_date)} />
                        <StateBadge state={a.state} />
                      </div>
                    </div>
                    {a.evidence_note ? (
                      <blockquote className="mt-2 rounded-lg border-l-2 border-indigo-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        {a.evidence_note}
                      </blockquote>
                    ) : null}
                    {a.rejection_reason && a.state === 'rejected' ? (
                      <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        Rejected: {a.rejection_reason}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

/**
 * Manager-only bounded AI review. The request carries only the control ID —
 * the server fetches the evidence itself and validates that any assessment
 * cites the evidence verbatim before returning it. Nothing shown here is
 * ever stored.
 */
function AiReviewCard({ controlId, hasEvidence }: { controlId: string; hasEvidence: boolean }) {
  const [result, setResult] = useState<AiReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestReview = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api<{ result: AiReviewResult }>(`/api/controls/${controlId}/ai-review`, {
        method: 'POST',
      });
      setResult(res.result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="AI evidence review"
      info={
        <p>
          Asks an AI whether the submitted evidence demonstrates the control is in place. It
          reads only the evidence note — nothing else about your organisation — and must quote
          it verbatim; otherwise you get an explicit &ldquo;insufficient evidence&rdquo; answer.
          Requests are rate-limited per day, and only metadata (never the text) is recorded.
          Requires an admin to have enabled AI review for your organisation.
        </p>
      }
      action={
        <Button size="sm" disabled={busy || !hasEvidence} onClick={() => void requestReview()}>
          <Sparkles className="h-4 w-4" /> {busy ? 'Reviewing…' : 'Request AI review'}
        </Button>
      }
    >
      <p className="text-xs text-slate-500">
        The AI reads only the submitted evidence note for this control — no other context — and
        must quote it verbatim or report insufficient evidence. Only metadata about the request is
        logged, never the content.
      </p>
      {!hasEvidence ? (
        <p className="mt-3 text-sm text-slate-500">No evidence has been submitted yet.</p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </p>
      ) : null}
      {result?.type === 'cited_assessment' ? (
        <blockquote className="mt-3 rounded-lg border-l-2 border-indigo-300 bg-indigo-50/60 px-3 py-2 text-sm text-slate-800">
          {result.assessment}
        </blockquote>
      ) : null}
      {result?.type === 'insufficient_evidence' ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {result.message}
        </p>
      ) : null}
    </Card>
  );
}

function BackLink() {
  return (
    <Link
      to="/controls"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600"
    >
      <ArrowLeft className="h-4 w-4" /> All controls
    </Link>
  );
}
