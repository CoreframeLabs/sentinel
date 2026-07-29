import { Role } from '../types';

/**
 * The seeded demo personas, for the one-click sign-in buttons on the login
 * page.
 *
 * These are NOT secrets and this file introduces no new exposure:
 *
 *   * They are fixtures created by `packages/backend/scripts/seed.ts`
 *     (`DEMO_ORG_NAME` / `DEMO_USERS` / `DEMO_PASSWORD`) and have been
 *     published in the README and rendered on the login page since the demo
 *     went live. Anyone who can reach the demo already has them.
 *   * They belong to one seeded organisation, "Acme Legal LLP", holding
 *     nothing but obviously fictional compliance data.
 *   * Clicking a button performs an ordinary POST /api/auth/login. There is
 *     no demo-only endpoint, no session shortcut and no server-side
 *     privilege: the request goes through bcrypt verification, the login rate
 *     limiter, session regeneration and the same organisation scoping as
 *     every other user. If the seed has not been run, the buttons simply fail
 *     with "Invalid email or password", exactly like any wrong credential.
 *
 * Consequently these accounts can only ever see their own tenant — the same
 * guarantee the isolation test suite enforces for every other organisation.
 *
 * Keep in step with the seed script; the buttons are only rendered when the
 * backend reports DEMO_MODE=true, so a real customer deployment never shows
 * them.
 */

export interface DemoAccount {
  role: Role;
  email: string;
  /** Fixture password, identical for all three seeded demo users. */
  password: string;
  /** Persona name as seeded, so the button matches the scenario card. */
  name: string;
  /** What this role is here to show off. */
  pitch: string;
}

const DEMO_PASSWORD = 'SentinelDemo!2026';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'manager',
    email: 'manager@demo.sentinel.app',
    password: DEMO_PASSWORD,
    name: 'Morgan Reeve',
    pitch: 'Review submitted evidence and run the bounded AI assessment',
  },
  {
    role: 'admin',
    email: 'admin@demo.sentinel.app',
    password: DEMO_PASSWORD,
    name: 'Alex Doyle',
    pitch: 'Control library, CSV import, audit trail and AI settings',
  },
  {
    role: 'employee',
    email: 'employee@demo.sentinel.app',
    password: DEMO_PASSWORD,
    name: 'Evan Castell',
    pitch: 'Record structured evidence against an assigned control',
  },
];

export const DEMO_ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
};
