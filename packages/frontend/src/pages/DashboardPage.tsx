import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Assignment, Attention, Control } from '../types';
import { Card, ErrorNotice, OverdueTag, StateBadge, StatusBadge } from '../components/ui';

function useControlNames() {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void api<{ controls: Control[] }>('/api/controls').then((res) => {
      setNames(Object.fromEntries(res.controls.map((c) => [c.id, c.name])));
    });
  }, []);
  return names;
}

function EmployeeQueue({
  assignments,
  awaitingReview,
  controlNames,
  onChanged,
}: {
  assignments: Assignment[];
  awaitingReview: Assignment[];
  controlNames: Record<string, string>;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const saveEvidence = async (assignment: Assignment) => {
    setError(null);
    try {
      await api(`/api/assignments/${assignment.id}/evidence`, {
        method: 'POST',
        body: { evidenceNote: notes[assignment.id] ?? '' },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const submit = async (assignment: Assignment) => {
    setError(null);
    try {
      await api(`/api/assignments/${assignment.id}/submit`, { method: 'POST' });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Needs your action">
        <ErrorNotice message={error} />
        {assignments.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing needs your attention. Well done.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {assignments.map((a) => (
              <li key={a.id} className="space-y-3 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{controlNames[a.control_id] ?? 'Control'}</p>
                    <p className="text-sm text-slate-500">
                      Due {a.due_date}
                      <OverdueTag dueDate={a.due_date} />
                    </p>
                    {a.state === 'rejected' && a.rejection_reason ? (
                      <p className="mt-1 text-sm text-rose-700">
                        Rejected: {a.rejection_reason}
                      </p>
                    ) : null}
                  </div>
                  <StateBadge state={a.state} />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={a.evidence_note ?? 'Evidence note…'}
                    className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    value={notes[a.id] ?? ''}
                    onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                  />
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
                    onClick={() => void saveEvidence(a)}
                  >
                    Save evidence
                  </button>
                  <button
                    type="button"
                    disabled={!a.evidence_note && !(notes[a.id] ?? '').trim()}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
                    onClick={() => void submit(a)}
                  >
                    Submit for review
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Waiting on your manager">
        {awaitingReview.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing awaiting review.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {awaitingReview.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3">
                <span className="font-medium">{controlNames[a.control_id] ?? 'Control'}</span>
                <StateBadge state={a.state} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ManagerQueue({
  readyForReview,
  controlNames,
  onChanged,
}: {
  readyForReview: Assignment[];
  controlNames: Record<string, string>;
  onChanged: () => void;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const review = async (assignment: Assignment, decision: 'accept' | 'reject') => {
    setError(null);
    try {
      await api(`/api/assignments/${assignment.id}/review`, {
        method: 'POST',
        body: { decision, reason: reasons[assignment.id] },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  return (
    <Card title="Ready for your review">
      <ErrorNotice message={error} />
      {readyForReview.length === 0 ? (
        <p className="text-sm text-slate-500">No submissions waiting for review.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {readyForReview.map((a) => (
            <li key={a.id} className="space-y-3 py-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{controlNames[a.control_id] ?? 'Control'}</p>
                <StateBadge state={a.state} />
              </div>
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {a.evidence_note}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"
                  onClick={() => void review(a, 'accept')}
                >
                  Accept
                </button>
                <input
                  type="text"
                  placeholder="Rejection reason…"
                  className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  value={reasons[a.id] ?? ''}
                  onChange={(e) => setReasons({ ...reasons, [a.id]: e.target.value })}
                />
                <button
                  type="button"
                  disabled={!(reasons[a.id] ?? '').trim()}
                  className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
                  onClick={() => void review(a, 'reject')}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AdminSummary({
  attention,
}: {
  attention: Extract<Attention, { role: 'admin' }>;
}) {
  const byStatus = Object.fromEntries(attention.statusSummary.map((s) => [s.status, s.count]));
  const tiles: { label: string; value: number }[] = [
    { label: 'Open assignments', value: attention.openAssignmentCount },
    { label: 'Overdue', value: attention.overdueCount },
    { label: 'Ready for review', value: attention.readyForReviewCount },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <p className="text-3xl font-bold">{t.value}</p>
            <p className="mt-1 text-sm text-slate-500">{t.label}</p>
          </Card>
        ))}
      </div>
      <Card title="Controls by status">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['pending', 'in_review', 'passed', 'deferred'] as const).map((status) => (
            <li key={status} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2">
              <StatusBadge status={status} />
              <span className="text-lg font-semibold">{byStatus[status] ?? 0}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm">
          <Link className="font-medium text-slate-700 underline" to="/controls">
            View all controls →
          </Link>
        </p>
      </Card>
    </div>
  );
}

export function DashboardPage() {
  const [attention, setAttention] = useState<Attention | null>(null);
  const [refresh, setRefresh] = useState(0);
  const controlNames = useControlNames();
  const onChanged = useCallback(() => setRefresh((n) => n + 1), []);

  useEffect(() => {
    void api<Attention>('/api/attention').then(setAttention);
  }, [refresh]);

  if (!attention) return <p className="text-sm text-slate-500">Loading…</p>;

  switch (attention.role) {
    case 'employee':
      return (
        <EmployeeQueue
          assignments={attention.openAssignments}
          awaitingReview={attention.awaitingReview}
          controlNames={controlNames}
          onChanged={onChanged}
        />
      );
    case 'manager':
      return (
        <ManagerQueue
          readyForReview={attention.readyForReview}
          controlNames={controlNames}
          onChanged={onChanged}
        />
      );
    case 'admin':
      return <AdminSummary attention={attention} />;
  }
}
