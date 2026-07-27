import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { useAuth } from '../auth';
import { Role } from '../types';

/**
 * Demo-only orientation card: tells a visitor which persona they are signed
 * in as and what is worth trying from here. Rendered only when the backend
 * reports demoMode (DEMO_MODE=true), so a real customer deployment never
 * sees it.
 *
 * Dismissal is kept in localStorage rather than on the user row: unlike the
 * guided tour flag this is a cosmetic, demo-only hint and does not justify a
 * schema column or a migration.
 */

const DISMISS_KEY = 'sentinel_demo_scenario_dismissed';

interface Scenario {
  persona: string;
  summary: string;
  steps: { label: string; to: string }[];
}

const SCENARIOS: Record<Role, Scenario> = {
  admin: {
    persona: 'Alex Doyle — Compliance Officer for Legal Practice (COLP)',
    summary:
      'You own the control library, the team and the firm’s compliance settings at Acme Legal LLP.',
    steps: [
      { label: 'Bulk-import next quarter’s controls from a CSV', to: '/imports' },
      { label: 'Turn AI evidence review on or off and set daily limits', to: '/ai-settings' },
      { label: 'Read the audit trail — immutable, even to you', to: '/audit' },
      { label: 'Invite a colleague with a single-use link', to: '/team' },
    ],
  },
  manager: {
    persona: 'Morgan Reeve — Compliance Manager',
    summary:
      'You assign controls to the team and decide whether the evidence they submit is good enough.',
    steps: [
      { label: 'Review the two submissions waiting in your queue', to: '/' },
      {
        label: 'Ask AI to assess the detailed CDD evidence — it must quote it verbatim',
        to: '/controls',
      },
      {
        label: 'Then try AI on the vague “Access control audit” note — watch it refuse',
        to: '/controls',
      },
      { label: 'Import controls from a CSV, with a dry run before anything is written', to: '/imports' },
    ],
  },
  employee: {
    persona: 'Evan Castell — Practice Support',
    summary:
      'Controls are assigned to you, and you record the evidence that they are actually in place.',
    steps: [
      { label: 'Record evidence on an open assignment and submit it', to: '/' },
      { label: 'Read why your training evidence was rejected, then resubmit', to: '/' },
      { label: 'Browse the firm’s control library', to: '/controls' },
      { label: 'See your own actions in the audit log', to: '/audit' },
    ],
  },
};

export function DemoScenarioCard() {
  const { user, demoMode } = useAuth();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === 'true'
  );

  if (!demoMode || !user || dismissed) return null;
  const scenario = SCENARIOS[user.role];

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  return (
    <section className="fade-in relative overflow-hidden rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
      <button
        type="button"
        aria-label="Dismiss demo guide"
        className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
        onClick={dismiss}
      >
        <X className="h-4 w-4" />
      </button>

      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-600">
        <Sparkles className="h-3.5 w-3.5" /> Demo scenario
      </p>
      <h2 className="mt-1.5 pr-8 text-base font-bold text-slate-900">
        You are signed in as {scenario.persona}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">{scenario.summary}</p>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Try this
      </p>
      <ol className="mt-2 space-y-1.5">
        {scenario.steps.map((step, i) => (
          <li key={step.label}>
            <Link
              to={step.to}
              className="group inline-flex items-start gap-2 text-sm text-slate-700 hover:text-indigo-700"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-indigo-700 ring-1 ring-inset ring-indigo-200">
                {i + 1}
              </span>
              <span className="underline-offset-2 group-hover:underline">{step.label}</span>
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
