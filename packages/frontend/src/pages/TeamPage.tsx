import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { OrgMember, Role } from '../types';
import { Card, ErrorNotice } from '../components/ui';

interface InvitationSummary {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export function TeamPage() {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    void api<{ users: OrgMember[] }>('/api/users').then((res) => setMembers(res.users));
    void api<{ invitations: InvitationSummary[] }>('/api/invitations').then((res) =>
      setInvitations(res.invitations)
    );
  }, [refresh]);

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIssuedToken(null);
    try {
      const res = await api<{ token: string }>('/api/invitations', {
        method: 'POST',
        body: { email, role },
      });
      setIssuedToken(res.token);
      setEmail('');
      setRefresh((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Invite a team member">
        <form onSubmit={(e) => void invite(e)} className="space-y-3">
          <ErrorNotice message={error} />
          <div className="flex gap-2">
            <input
              type="email"
              required
              placeholder="colleague@firm.example"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Create invitation
            </button>
          </div>
          {issuedToken ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
              <p className="font-medium text-amber-800">
                Invitation token (shown once — share it securely):
              </p>
              <code className="mt-1 block break-all font-mono text-xs">{issuedToken}</code>
            </div>
          ) : null}
        </form>
      </Card>

      <Card title={`Members (${members.length})`}>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{m.displayName}</p>
                <p className="text-xs text-slate-500">{m.email}</p>
              </div>
              <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-700">
                {m.role}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={`Invitations (${invitations.length})`}>
        {invitations.length === 0 ? (
          <p className="text-sm text-slate-500">No invitations yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">{inv.email}</p>
                  <p className="text-xs text-slate-500">
                    {inv.role} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    inv.usedAt
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {inv.usedAt ? 'Accepted' : 'Pending'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
