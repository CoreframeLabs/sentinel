import { FormEvent, useEffect, useState } from 'react';
import { Check, Copy, Mail, UserPlus, Users } from 'lucide-react';
import { api, ApiError } from '../api';
import { useToast } from '../components/toast';
import { OrgMember, Role } from '../types';
import {
  Button,
  Card,
  EmptyState,
  inputClass,
  Modal,
  PageHeader,
} from '../components/ui';
import { formatDate, initials } from '../lib/format';

interface InvitationSummary {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

const ROLE_STYLES: Record<Role, string> = {
  admin: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  manager: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  employee: 'bg-slate-100 text-slate-600 ring-slate-600/10',
};

export function TeamPage() {
  const toast = useToast();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    void api<{ users: OrgMember[] }>('/api/users').then((res) => setMembers(res.users));
    void api<{ invitations: InvitationSummary[] }>('/api/invitations').then((res) =>
      setInvitations(res.invitations)
    );
  }, [refresh]);

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ token: string }>('/api/invitations', {
        method: 'POST',
        body: { email, role },
      });
      setIssuedToken(res.token);
      setCopied(false);
      setEmail('');
      setRefresh((n) => n + 1);
      toast.success('Invitation created.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const copyToken = async () => {
    if (!issuedToken) return;
    await navigator.clipboard.writeText(issuedToken);
    setCopied(true);
    toast.success('Token copied to clipboard.');
  };

  const closeInvite = () => {
    setShowInvite(false);
    setIssuedToken(null);
    setCopied(false);
  };

  return (
    <div className="fade-in space-y-6">
      <PageHeader
        title="Team"
        subtitle={`${members.length} member${members.length === 1 ? '' : 's'} in your organisation.`}
        info={
          <>
            <p>
              Invite people by email with a role: <strong>Admins</strong> manage controls, the
              team and settings; <strong>Managers</strong> assign controls, review evidence, run
              imports and AI reviews; <strong>Employees</strong> record evidence for their
              assignments.
            </p>
            <p>
              Invitations are single-use links that expire; share each link with its recipient
              yourself.
            </p>
          </>
        }
        action={
          <Button onClick={() => setShowInvite(true)}>
            <UserPlus className="h-4 w-4" /> Invite member
          </Button>
        }
      />

      <Card title="Members">
        {members.length === 0 ? (
          <EmptyState icon={Users} title="No members yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3.5 py-3.5 first:pt-0 last:pb-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                  {initials(m.displayName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{m.displayName}</p>
                  <p className="truncate text-xs text-slate-500">{m.email}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${ROLE_STYLES[m.role]}`}
                >
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Invitations">
        {invitations.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No invitations yet"
            hint="Invite a colleague and share the one-time token with them securely."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3.5 text-sm first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-semibold text-slate-900">{inv.email}</p>
                  <p className="text-xs capitalize text-slate-500">
                    {inv.role} · expires {formatDate(inv.expiresAt)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                    inv.usedAt
                      ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/20'
                      : 'bg-amber-50 text-amber-800 ring-amber-600/20'
                  }`}
                >
                  {inv.usedAt ? 'Accepted' : 'Pending'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal title="Invite a team member" open={showInvite} onClose={closeInvite}>
        {issuedToken ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Share this one-time token with your colleague — it is shown only once and expires in
              7 days. They redeem it on the registration screen.
            </p>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs text-slate-800">
                {issuedToken}
              </code>
              <Button variant="secondary" size="sm" onClick={() => void copyToken()}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={closeInvite}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void invite(e)} className="space-y-4">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Email</span>
              <input
                type="email"
                required
                autoFocus
                placeholder="colleague@firm.example"
                className={`mt-1.5 ${inputClass}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Role</span>
              <select
                className={`mt-1.5 ${inputClass}`}
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="employee">Employee — completes assigned controls</option>
                <option value="manager">Manager — assigns and reviews</option>
                <option value="admin">Admin — full organisation access</option>
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={closeInvite}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !email.trim()}>
                {busy ? 'Creating…' : 'Create invitation'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
