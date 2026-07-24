import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { Assignment, Control, ControlStatus, OrgMember } from '../types';
import { Card, ErrorNotice, OverdueTag, StateBadge, StatusBadge } from '../components/ui';

const ALL_STATUSES: ControlStatus[] = ['pending', 'in_review', 'passed', 'deferred'];

export function ControlDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [control, setControl] = useState<Control | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
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

  if (notFound) return <p className="text-sm text-slate-500">Control not found.</p>;
  if (!control) return <p className="text-sm text-slate-500">Loading…</p>;

  const changeStatus = async (status: ControlStatus) => {
    setError(null);
    try {
      await api(`/api/controls/${control.id}/status`, { method: 'PATCH', body: { status } });
      setRefresh((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const assign = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await api('/api/assignments', {
        method: 'POST',
        body: { controlId: control.id, assigneeId, dueDate },
      });
      setAssigneeId('');
      setDueDate('');
      setRefresh((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const memberName = (memberId: string) =>
    members.find((m) => m.id === memberId)?.displayName ?? memberId.slice(0, 8);

  return (
    <div className="space-y-6">
      <Card>
        <ErrorNotice message={error} />
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">{control.name}</h1>
            {control.description ? (
              <p className="mt-1 text-sm text-slate-600">{control.description}</p>
            ) : null}
          </div>
          <StatusBadge status={control.status} />
        </div>
        {user?.role === 'admin' ? (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-sm text-slate-500">Set status:</span>
            {ALL_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                disabled={status === control.status}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-40"
                onClick={() => void changeStatus(status)}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>
        ) : null}
      </Card>

      {canAssign ? (
        <Card title="Assign this control">
          <form onSubmit={(e) => void assign(e)} className="flex gap-2">
            <select
              required
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Select assignee…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName} ({m.role})
                </option>
              ))}
            </select>
            <input
              type="date"
              required
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Assign
            </button>
          </form>
        </Card>
      ) : null}

      <Card title={`Assignments (${assignments.length})`}>
        {assignments.length === 0 ? (
          <p className="text-sm text-slate-500">Not assigned to anyone yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{memberName(a.assignee_id)}</p>
                  <p className="text-xs text-slate-500">
                    Due {a.due_date}
                    <OverdueTag dueDate={a.due_date} />
                  </p>
                  {a.evidence_note ? (
                    <p className="mt-1 text-xs text-slate-600">Evidence: {a.evidence_note}</p>
                  ) : null}
                  {a.rejection_reason && a.state === 'rejected' ? (
                    <p className="mt-1 text-xs text-rose-700">Rejected: {a.rejection_reason}</p>
                  ) : null}
                </div>
                <StateBadge state={a.state} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
