import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ClipboardCheck, ScrollText, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { useAuth } from '../auth';
import { ApiError } from '../api';
import { Button, ErrorNotice, inputClass } from '../components/ui';
import { DEMO_ACCOUNTS, DEMO_ROLE_LABELS } from '../lib/demoAccounts';

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: 'Track every control',
    text: 'A single library of your regulatory controls with clear owners and due dates.',
  },
  {
    icon: Users,
    title: 'Role-based queues',
    text: 'Employees, managers and admins each see exactly what needs their action.',
  },
  {
    icon: ScrollText,
    title: 'Append-only audit trail',
    text: 'Every state change recorded immutably — enforced by the database itself.',
  },
];

export function LoginPage() {
  const { user, login, demoMode } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Which demo persona is mid-sign-in, so only that button shows a spinner. */
  const [demoBusy, setDemoBusy] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  const anyBusy = busy || demoBusy !== null;

  const signIn = async (
    demoEmail: string,
    demoPassword: string,
    setPending: (pending: boolean) => void
  ) => {
    setPending(true);
    setError(null);
    try {
      await login(demoEmail, demoPassword);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setPending(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await signIn(email, password, setBusy);
  };

  /**
   * One-click demo sign-in. Deliberately just the ordinary login call with
   * the seeded fixture credentials — there is no demo-only endpoint and no
   * session shortcut, so the demo user gets exactly the tenant-scoped
   * session any other user would.
   */
  const onDemoSignIn = (account: (typeof DEMO_ACCOUNTS)[number]) =>
    void signIn(account.email, account.password, (pending) =>
      setDemoBusy(pending ? account.role : null)
    );

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="hidden flex-1 flex-col justify-between bg-slate-900 p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-indigo-500/15 p-2">
            <ShieldCheck className="h-6 w-6 text-indigo-400" />
          </span>
          <span className="text-xl font-bold tracking-tight text-white">Sentinel</span>
        </div>
        <div className="max-w-md space-y-8">
          <h1 className="text-3xl font-bold leading-tight text-white">
            Compliance tracking your whole team actually keeps up with.
          </h1>
          <ul className="space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3.5">
                <span className="mt-0.5 h-fit rounded-lg bg-slate-800 p-2">
                  <f.icon className="h-4 w-4 text-indigo-400" />
                </span>
                <div>
                  <p className="font-semibold text-slate-100">{f.title}</p>
                  <p className="mt-0.5 text-sm text-slate-400">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-500">
          A Coreframe Labs open-source demonstration project.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <div className="flex items-center justify-center gap-2">
              <ShieldCheck className="h-6 w-6 text-indigo-600" />
              <span className="text-xl font-bold tracking-tight">Sentinel</span>
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">
              Use your work email to access your organisation.
            </p>
          </div>
          <form
            onSubmit={(e) => void onSubmit(e)}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <ErrorNotice message={error} />
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                autoFocus
                className={`mt-1.5 ${inputClass}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                className={`mt-1.5 ${inputClass}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <Button type="submit" disabled={anyBusy} className="w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {/*
            Demo sign-in. Rendered only when the backend reports
            DEMO_MODE=true, so a real customer deployment never advertises
            these accounts — previously this block was unconditional.
          */}
          {demoMode && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-600">
                <Sparkles className="h-3.5 w-3.5" /> Live demo
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                Pick a role to sign in instantly. It is a self-contained demo
                organisation — Acme Legal LLP — filled with fictional data.
              </p>
              <ul className="mt-3 space-y-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <li key={account.role}>
                    <button
                      type="button"
                      disabled={anyBusy}
                      onClick={() => onDemoSignIn(account)}
                      className="group w-full rounded-lg bg-white px-3 py-2.5 text-left shadow-sm ring-1 ring-inset ring-indigo-200 transition-colors hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:pointer-events-none disabled:opacity-45"
                    >
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-sm font-semibold text-slate-900">
                          {demoBusy === account.role
                            ? 'Signing in…'
                            : `Sign in as ${DEMO_ROLE_LABELS[account.role]}`}
                        </span>
                        <span className="text-xs text-slate-500">{account.name}</span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                        {account.pitch}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Or sign in manually with any of{' '}
                <code className="font-mono">admin@</code>,{' '}
                <code className="font-mono">manager@</code> or{' '}
                <code className="font-mono">employee@demo.sentinel.app</code> — password{' '}
                <code className="font-mono">SentinelDemo!2026</code>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
