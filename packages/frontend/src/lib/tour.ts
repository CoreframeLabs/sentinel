import { User } from '../types';

/**
 * Guided tour definitions, tailored to the signed-in role. Each step can
 * navigate to a route and spotlight an element carrying a matching
 * data-tour attribute; target null renders a centred card over a dimmed
 * backdrop (welcome / closing steps).
 */
export interface TourStep {
  /** Value of the data-tour attribute to spotlight, or null for a centred card. */
  target: string | null;
  /** Route to navigate to before showing the step; null keeps the current page. */
  route: string | null;
  title: string;
  body: string;
}

const CLOSING_STEP: TourStep = {
  target: 'tour-help',
  route: null,
  title: 'That’s the tour',
  body: 'You can restart it any time from this button. Everything you just saw is enforced server-side too — roles, tenant isolation and the append-only records hold no matter what the UI does.',
};

export function buildTourSteps(user: User): TourStep[] {
  const firstName = user.displayName.split(' ')[0] ?? user.displayName;

  const dashboard = (body: string): TourStep => ({
    target: 'nav-dashboard',
    route: '/',
    title: 'Dashboard',
    body,
  });
  const controls = (body: string): TourStep => ({
    target: 'nav-controls',
    route: '/controls',
    title: 'Controls library',
    body,
  });
  const audit: TourStep = {
    target: 'nav-audit',
    route: '/audit',
    title: 'Audit log',
    body: 'Every state change in your organisation, append-only and immutable at the database level — user, action and control IDs only, never content. Read-only for everyone, including admins.',
  };
  const imports: TourStep = {
    target: 'nav-imports',
    route: '/imports',
    title: 'CSV import',
    body: 'Bulk-import controls from a CSV: upload, map columns (save the mapping as a reusable profile), review a validation dry run, then confirm. Every row’s outcome — accepted or rejected, with the reason — is kept in an append-only history with checksums.',
  };

  switch (user.role) {
    case 'admin':
      return [
        {
          target: null,
          route: '/',
          title: `Welcome to Sentinel, ${firstName}`,
          body: 'You are signed in as an admin — you run this organisation: its controls, its team, and its settings. This one-minute tour shows you around; leave it any time and restart it later from the compass button in the sidebar.',
        },
        dashboard(
          'Your organisation-wide picture: compliance score, how controls are distributed across statuses, open and overdue work, and recent activity.'
        ),
        controls(
          'Every compliance control you track, with search and status filters. Open a control to change its status or see its assignments.'
        ),
        {
          target: 'new-control',
          route: '/controls',
          title: 'Create controls',
          body: 'Define controls one at a time here…',
        },
        { ...imports, body: '…or in bulk. ' + imports.body },
        audit,
        {
          target: 'nav-team',
          route: '/team',
          title: 'Team',
          body: 'Invite admins, managers and employees with single-use, expiring invitation links. Managers assign and review; employees record evidence.',
        },
        {
          target: 'nav-ai',
          route: '/ai-settings',
          title: 'AI review',
          body: 'Enable bounded AI evidence review for your organisation and set daily rate limits. The AI only ever sees the one evidence note under review, must quote it verbatim, and only metadata about each request is recorded — never content.',
        },
        CLOSING_STEP,
      ];

    case 'manager':
      return [
        {
          target: null,
          route: '/',
          title: `Welcome to Sentinel, ${firstName}`,
          body: 'You are signed in as a manager — you assign controls, review the evidence your team submits, and can bulk-import controls. This one-minute tour shows you around; restart it any time from the compass button in the sidebar.',
        },
        dashboard(
          'Your review queue: submissions that are ready for review, with inline accept and reject (rejecting requires a reason the assignee will see).'
        ),
        controls(
          'Open any control to assign it to a team member with a due date. Once evidence has been submitted, you can also request an AI review there — it must quote the evidence verbatim or explicitly report that the evidence is insufficient.'
        ),
        imports,
        audit,
        CLOSING_STEP,
      ];

    case 'employee':
    default:
      return [
        {
          target: null,
          route: '/',
          title: `Welcome to Sentinel, ${firstName}`,
          body: 'You are signed in as an employee — controls get assigned to you, and you record the evidence that they are in place. This quick tour shows you around; restart it any time from the compass button in the sidebar.',
        },
        dashboard(
          'Your work at a glance: open assignments with due dates, anything overdue flagged. Add an evidence note and submit it for review right here — if a reviewer rejects it, you’ll see their reason and can revise and resubmit.'
        ),
        controls(
          'The full library of controls your organisation tracks, so you can see where your assignments fit. Browsing is read-only for your role.'
        ),
        audit,
        CLOSING_STEP,
      ];
  }
}
