# Sentinel

[![CI](https://github.com/CoreframeLabs/sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/CoreframeLabs/sentinel/actions/workflows/ci.yml)

**Sentinel** is a multi-tenant compliance control tracker for small professional
services teams — law firms, accountancies, HR departments, financial advisors.
Teams use it to track whether their regulatory controls are in place, who is
responsible for each control, and whether evidence has been reviewed.

This is a Coreframe Labs portfolio project. Its purpose is to demonstrate, in
verifiable code, how we build secure multi-tenant SaaS: strict organisation
isolation enforced at the data layer, session-based authentication done
properly, role-based access control, an append-only audit trail, structured
non-content logging, and operational tooling (backup, restore, tenant
deletion) treated as first-class deliverables.

## What it does

- **Controls library** — admins define named compliance controls
  ("Data Retention Policy reviewed", "Access control audit"). Each control has
  a status: Pending, In Review, Passed, Deferred.
- **Assignments** — managers assign controls to employees with a due date.
  Employees record evidence (text note in v1) and submit for review; managers
  accept or reject with a reason.
- **Attention queue** — each role sees only what needs their action: employees
  see open and overdue work, managers see submissions ready for review, admins
  see the organisation-wide picture.
- **Audit log** — every state change is recorded with UTC timestamp, user ID,
  action and control ID. IDs only, never content. Append-only, enforced by a
  database trigger; read-only to every user including admins.

## Architecture

```
  ┌──────────────────┐        ┌───────────────────────┐        ┌──────────────┐
  │  React frontend   │  /api  │  Express API (Node.js) │        │  PostgreSQL   │
  │  Vite + Tailwind  ├───────►│  TypeScript, strict     ├───────►│  migrations,  │
  │  (Vercel)         │ proxy  │  (Railway, Docker)      │        │  sessions,    │
  └──────────────────┘        └───────────────────────┘        │  audit log    │
                                                                └──────────────┘
```

Monorepo layout:

```
packages/backend    Express + PostgreSQL API, migrations, scripts, tests
packages/frontend   React + TypeScript + Tailwind (Vite)
```

The frontend is served same-origin with the API (Vite proxy in development,
Vercel rewrites in production). This is deliberate: it allows the session
cookie to be `sameSite: 'strict'`, which a cross-site API would break.

## Security decisions

Each of these is implemented in code you can read, not just claimed:

- **Fail-closed startup** — the server validates configuration and proves the
  database is reachable before binding the port; otherwise it logs the reason
  (never the connection string) and exits 1. (`src/index.ts`)
- **Data-layer tenant isolation** — every organisation-scoped table has a
  `NOT NULL organisation_id` foreign key, and every repository method requires
  an `organisationId` parameter baked into its `WHERE` clause. Route handlers
  take the organisation ID from the server-side session, never from the
  client. Cross-tenant access returns 404, indistinguishable from
  "does not exist". (`src/repositories/`, verified in
  `tests/integration/isolation.test.ts`)
- **Parameterised queries only** — no string interpolation of values anywhere
  in SQL.
- **bcrypt at 12 rounds** — with a burned dummy comparison on unknown emails
  so login timing does not reveal whether an account exists; the login error
  message is identical for both failure modes. (`src/routes/auth.ts`)
- **PostgreSQL-backed sessions** — `express-session` + `connect-pg-simple`;
  nothing in memory, sessions survive restarts. Cookie is `httpOnly`,
  `secure` in production, `sameSite: 'strict'`, 8-hour expiry. Logout
  destroys the session row server-side. Login regenerates the session ID to
  prevent fixation. (`src/lib/session.ts`)
- **CSRF protection** — double-submit cookie pattern on every state-changing
  route with no exemptions (login included, which blocks login CSRF).
  (`src/middleware/csrf.ts`)
- **Constant-time token comparison** — CSRF tokens and invitation verifiers
  are compared with `crypto.timingSafeEqual`, never `===`; each usage carries
  a comment explaining why. Invitation tokens use a selector/verifier split
  with only the verifier's SHA-256 hash stored. (`src/lib/safeCompare.ts`,
  `src/lib/invitationToken.ts`)
- **Secrets via environment only** — no defaults, missing variables are named
  at startup and the process exits 1; `SESSION_SECRET` must be ≥ 32
  characters; secrets never appear in logs. (`src/config.ts`)
- **Login rate limiting** — 10 attempts per 15 minutes per IP, 429 with
  `Retry-After`; hits logged with IP and timestamp only.
  (`src/middleware/rateLimit.ts`)
- **Structured non-content logging** — pino, JSON with ISO 8601 UTC
  timestamps. Logs carry event names and IDs (`user_id`, `org_id`,
  `control_id`) — never passwords, tokens, emails, names, or anything a user
  typed. (`src/logger.ts`)
- **Append-only audit log** — a database trigger rejects `UPDATE` and
  `DELETE` on `audit_log` regardless of the caller's application role.
  (`migrations/0003_audit-append-only.js`)
- **Protected diagnostics** — public `/health` (200/503, no detail);
  admin-only `/api/admin/diagnostics` with pool stats and uptime.
- **Generic production errors** — stack traces are logged internally and
  never sent to clients in production. (`src/middleware/errorHandler.ts`)

## Running locally

Requires Docker and Node 22+.

```bash
# 1. Start PostgreSQL (dev + test databases)
docker compose up -d postgres postgres-test

# 2. Install dependencies
npm ci

# 3. Configure the backend (.env is auto-loaded in development)
cd packages/backend
cp .env.example .env
# set DATABASE_URL=postgres://sentinel:sentinel_local_dev@localhost:5432/sentinel
# and a SESSION_SECRET of at least 32 characters, e.g. from:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. Migrate and seed demo data
npm run migrate:up
npm run seed

# 5. Run the API (port 3000)
npm run dev

# 6. In another terminal: run the frontend (port 5173, proxies /api)
cd packages/frontend
npm run dev
```

Or run the whole backend stack containerised: `docker compose up --build`.

## Test suite

```bash
# Unit + integration (integration tests need the postgres-test container)
docker compose up -d postgres-test
npm test

# Separately:
npm run test:unit --workspace=packages/backend
npm run test:integration --workspace=packages/backend
```

Integration coverage includes: registration/login (wrong password, unknown
user, rate limiting), session expiry and server-side logout, CSRF rejection,
cross-organisation isolation, role boundaries, audit-log immutability at the
database level, and a full backup → tamper/restore cycle. Tests run against a
dedicated test database, never the development one.

## Backup, restore, organisation deletion

```bash
cd packages/backend

# Export all tables to backups/sentinel-backup-<timestamp>.json + .sha256
DATABASE_URL=... npm run backup

# Restore (verifies the SHA-256 hash first; aborts on mismatch)
DATABASE_URL=... npm run restore -- backups/sentinel-backup-<timestamp>.json

# Delete an organisation (lists row counts, requires typed confirmation)
DATABASE_URL=... npm run delete-org -- <organisation-uuid>
```

Backups exclude the session table (live session IDs are secrets) and record
the schema version; restore refuses to run against a database on a different
migration version.

## Live demo

- Frontend: `https://sentinel-demo.vercel.app` *(update after deploy)*
- API health: `https://<railway-app>.up.railway.app/health`

Demo organisation (Acme Legal LLP) accounts — **demo environment only**:

| Role     | Email                       | Password            |
| -------- | --------------------------- | ------------------- |
| Admin    | admin@demo.sentinel.app     | `SentinelDemo!2026` |
| Manager  | manager@demo.sentinel.app   | `SentinelDemo!2026` |
| Employee | employee@demo.sentinel.app  | `SentinelDemo!2026` |

## Deployment

**Railway (backend + PostgreSQL)**

1. Provision a PostgreSQL service in Railway.
2. Create a service from this repo; set the Dockerfile path to
   `packages/backend/Dockerfile` (build context: repo root).
3. Environment variables: `DATABASE_URL` (from the Railway Postgres service),
   `SESSION_SECRET` (≥ 32 random characters), `NODE_ENV=production`,
   `FRONTEND_URL` (the Vercel URL).
4. Health check path: `/health`. Migrations run automatically on boot.
5. Seed the demo org once: `railway run npm run seed` (from
   `packages/backend`).

**Vercel (frontend)**

1. Import the repo, set the project root to `packages/frontend`.
2. Edit `packages/frontend/vercel.json` and replace the placeholder Railway
   hostname in the rewrites with your backend URL — the frontend calls the
   API same-origin through these rewrites so session cookies can remain
   `sameSite: 'strict'`. (`VITE_API_URL` is supported for non-proxied setups
   but not recommended: a cross-site API forces weaker cookie settings.)

## CI

GitHub Actions (`.github/workflows/ci.yml`): install → typecheck → lint →
test against a PostgreSQL service container → frontend build → backend Docker
image build → `npm audit` on production dependencies.
