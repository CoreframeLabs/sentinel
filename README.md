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
- **Assignments and structured evidence** — managers assign controls to
  employees with a due date. Employees record evidence the way an auditor
  would: a narrative summary plus how the control was tested (inspection /
  observation / inquiry / re-performance), the period covered, the sample
  examined out of the population, and where the record is filed — with a
  live completeness meter. Managers accept or reject with a reason.
- **Attention queue** — each role sees only what needs their action: employees
  see open and overdue work, managers see submissions ready for review, admins
  see the organisation-wide picture.
- **Audit log** — every state change is recorded with UTC timestamp, user ID,
  action and control ID. IDs only, never content. Append-only, enforced by a
  database trigger; read-only to every user including admins.
- **Guided tour & contextual help** — a role-tailored walkthrough (different
  steps for admins, managers and employees) auto-starts on a user's first
  login and can be replayed any time from the compass button in the sidebar.
  "First time" is tracked per user server-side (`users.tour_completed_at`),
  not per browser, so it follows the user across devices and never re-nags
  after finishing or skipping. Every page and key section also carries an
  ⓘ info button explaining what it is for and how to use it, with copy
  tailored to the viewer's role.
- **CSV import with provenance** — admins and managers bulk-import controls
  from a CSV with saved column-mapping profiles, a validation dry run, and an
  append-only record of every row's outcome. See
  [CSV import](#csv-import-with-provenance).
- **Bounded AI review** — managers can request an AI assessment of the
  evidence submitted for a control, strictly limited to that one evidence
  note, with citations validated in the application layer. Disabled by
  default per organisation. See [Bounded AI review](#bounded-ai-review).

## CSV import with provenance

Admins and managers can bulk-import compliance controls from a CSV file
(`Import` in the sidebar). No file to hand? The upload step offers a **blank
template** and a **sample file** — the sample deliberately includes rows with a
missing name, a past due date and an unparseable date, so a dry run shows how
rejections are reported rather than a uniform pass. The accepted format is
stated on screen: `Control Name` (required, ≤255 characters), `Description`,
`Category`, and `Due Date` (`YYYY-MM-DD`, must be in the future).

The flow is deliberately staged:

1. **Upload** — the file (max 5MB, `text/csv` only, MIME-checked server-side)
   is parsed in memory. The response is the detected headers plus the first
   five rows as a preview. The file is never written to disk or stored; only
   its SHA-256 checksum is ever persisted.
2. **Map** — CSV columns are mapped to control fields: `name` (required),
   `description`, `category`, `due_date` (optional). Common headers are
   detected automatically (`Due Date`, `due_date`, `Deadline` all match the
   due-date field) and pre-filled for you to confirm or change. Mappings can
   be saved as named, organisation-scoped profiles and reused (admins and
   managers create and use profiles; only admins delete them).
3. **Dry run** — every row is validated: name present and ≤ 255 characters;
   `due_date`, when present, a real future `YYYY-MM-DD` date. The summary
   previews the controls that would be created and lists each rejected row
   with its number, original values and a specific reason. Nothing is written.
4. **Confirm** — a separate request that re-submits the file and re-validates
   every row server-side (a client claim that "these rows passed" is ignored
   — there is no server-side draft state to tamper with). Accepted rows
   become controls; every row's outcome is recorded.
5. **History** — all runs for the organisation, each expandable to row-level
   results.

The provenance record per run: UTC timestamp, user ID, organisation ID, the
file's SHA-256 checksum, total/accepted/rejected counts, and the profile used
(if any). Per row: row number, the SHA-256 of the raw row values joined by
comma, accepted/rejected status, rejection reason, and the created control ID
for accepted rows. `csv_import_runs` and `csv_import_row_results` are
append-only, enforced by database triggers.

**Verifying a row checksum** — take the original CSV row's cell values, join
them with commas, and hash:

```bash
node -e "console.log(require('crypto').createHash('sha256')
  .update(['Access review','Quarterly review','Security','2027-01-15'].join(','))
  .digest('hex'))"
```

Compare against `row_checksum` in the run's row results.

RBAC: upload/map/dry-run/confirm and history — admin and manager; employees
have no access to any import endpoint. Profile deletion — admin only.

## Bounded AI review

Managers can request an AI assessment of the evidence submitted for a control
(the control detail page). The result is an audit finding, not a chat reply: a
**verdict** (satisfied / partially satisfied / not satisfied), **findings**
each backed by a quote, and the **gaps** the evidence does not close — with
every quoted phrase highlighted in the evidence itself, so you can see what the
model actually cited and what it ignored.

Runs on **Groq or OpenAI** — both speak the same wire format, so the provider
is one environment variable (`AI_PROVIDER`) and no code change.

The trust boundary is enforced at the data layer:

- **Disabled by default.** Two switches must both be on: the deployment flag
  (`AI_FEATURE_ENABLED`) and the per-organisation toggle, which only an admin
  can enable (`AI review` in the sidebar). The org flag is checked in the
  repository before any prompt is constructed.
- **Bounded context.** The prompt contains a fixed system message and exactly
  one user message: the evidence note for that control's review. No control
  name, organisation, user names, other controls, or prior interactions. The
  evidence is fetched from the database using the session's organisation ID —
  the endpoint does not accept evidence text in the request body, so a
  manipulated payload cannot inject content into the prompt.
- **Citation validation, in code.** Every finding's citation must appear
  verbatim in the evidence or that finding is discarded; if nothing survives,
  the result is an explicit insufficient-evidence response, as it is for a
  reply containing `INSUFFICIENT_EVIDENCE`. A verdict outside the permitted
  set is ignored. Parsing is defensive — a model that ignores the JSON
  contract falls back to the prose path rather than erroring — and the model
  is never trusted to have cited anything.
- **Review posture, without a prompt-injection hole.** Admins choose a posture
  (balanced / strict / coaching) that selects a *code-defined* prompt fragment
  by enum key. The value is validated against the enum, is never interpolated
  into the prompt, and cannot relax the core rules: evidence only, verbatim
  citation, explicit insufficient-evidence. A tampered database row cannot
  rewrite the reviewer's instructions.
- **Database-backed rate limits.** Per-user (default 10/day) and per-org
  (default 50/day) limits, admin-configurable, counted from the
  `ai_interactions` table with a 24-hour sliding window — they survive server
  restarts. Exceeding either returns 429.
- **Metadata-only logging.** Every interaction appends a row (append-only,
  database trigger): who, when, control and review IDs, model, token counts,
  the validated response type (`cited_assessment` / `insufficient_evidence` /
  `rate_limited` / `error`) and whether citations were present. The evidence
  text, prompt, raw response, **verdict and findings** are never stored and
  never logged — a verdict is the model's conclusion, which is content.
  Upstream failures map to 503 with an `error_code` (`timeout`,
  `upstream_rate_limited`) in the interaction record.

RBAC: requesting a review — manager only. Enabling the feature, configuring
limits, and viewing the interaction history — admin only. Employees have no
access.

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
- **Stateless, re-validated import confirmation** — the CSV dry run stores
  nothing server-side; the confirm endpoint re-validates every row from the
  re-submitted file and ignores any client-supplied validation results. A
  request naming a different organisation is rejected with 403.
  (`src/routes/imports.ts`, verified in
  `tests/integration/csvImport.test.ts`)
- **Uploads processed in memory, checksums only** — the CSV is size-capped
  (5MB) and MIME-checked before parsing, never written to disk or database;
  provenance is SHA-256 checksums (file and per-row) in append-only tables
  enforced by triggers. (`migrations/0004_csv-import.js`)
- **AI trust boundary at the data layer** — the AI feature flag and both
  rate limits are checked against the database (they survive restarts); the
  prompt is bounded to a single evidence note fetched server-side; model
  responses are citation-validated in application code; the `ai_interactions`
  table is metadata-only and append-only.
  (`src/repositories/aiFeature.ts`, `src/lib/aiReview.ts`,
  `migrations/0005_ai-review.js`, verified in
  `tests/integration/aiReview.test.ts`)
- **Fail-closed AI configuration** — with `AI_FEATURE_ENABLED=true` and no
  `OPENAI_API_KEY`, the server names the missing variable and exits 1; the
  key is never logged. (`src/config.ts`)

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

### Environment variables

| Variable                | Required                          | Default       | Description                                                    |
| ----------------------- | --------------------------------- | ------------- | -------------------------------------------------------------- |
| `DATABASE_URL`          | yes                               | —             | PostgreSQL connection string                                   |
| `SESSION_SECRET`        | yes                               | —             | Session signing secret, ≥ 32 characters                        |
| `NODE_ENV`              | no                                | `development` | `development` / `production` / `test`                          |
| `FRONTEND_URL`          | in production                     | dev localhost | Frontend origin for CORS                                       |
| `PORT`                  | no                                | `3000`        | API listen port                                                |
| `AI_FEATURE_ENABLED`    | no                                | `false`       | Deployment-level AI review switch (`true`/`false`)             |
| `AI_PROVIDER`           | no                                | `openai`      | `groq` or `openai` — both use the same OpenAI-compatible SDK   |
| `GROQ_API_KEY`          | when provider is `groq` and AI on | —             | Groq API key; startup exits 1 if missing while AI is enabled   |
| `OPENAI_API_KEY`        | when provider is `openai` and AI on | —           | OpenAI API key; startup exits 1 if missing while AI is enabled |
| `AI_MODEL`              | no                                | per provider  | Review model (`llama-3.3-70b-versatile` / `gpt-4o-mini`)       |
| `AI_BASE_URL`           | no                                | per provider  | Override the API base URL (proxy or compatible endpoint)       |
| `AI_REQUEST_TIMEOUT_MS` | no                                | `30000`       | Per-call OpenAI timeout in milliseconds                        |
| `DEMO_MODE`             | no                                | `false`       | Shows a role-aware demo scenario card; off for real deployments |

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
database level, and a full backup → tamper/restore cycle. The CSV import
suite covers the full upload → dry run → confirm flow, per-row rejection
reasons, checksum verification, server-side re-validation of manipulated
confirmation payloads, size (413) and type (415) rejection, cross-tenant
profile and history isolation, and database-level append-only enforcement.
The AI review suite covers the disabled-by-default flag, role boundaries,
prompt boundedness, citation validation, database-backed rate limits (that
survive an app restart), timeout and upstream-429 handling, and append-only
`ai_interactions` — all against an injected fake AI client; tests never call
OpenAI. Tests run against a dedicated test database, never the development
one.

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

- Frontend: `https://sentinel.coreframe-labs.dev`
- API health: `https://sentinel.coreframe-labs.dev/health` (proxied to
  the backend, proving the same-origin rewrite chain)

When the backend reports `DEMO_MODE=true`, the sign-in page offers a
**one-click "Sign in as Admin / Manager / Employee"** button per persona, so a
visitor is never stopped by a credential wall.

Those buttons are not a bypass. Each one performs an ordinary
`POST /api/auth/login` with the seeded fixture credentials below — there is no
demo-only endpoint, no session shortcut and no relaxed authorisation. The
request goes through bcrypt verification, the login rate limiter, session
regeneration and the same organisation scoping as any other user, so a demo
session can only ever reach the seeded demo tenant. The buttons are rendered
only when `DEMO_MODE=true`, so a real customer deployment never shows them.

Demo organisation (Acme Legal LLP) accounts — **demo environment only**:

| Role     | Email                       | Password            |
| -------- | --------------------------- | ------------------- |
| Admin    | admin@demo.sentinel.app     | `SentinelDemo!2026` |
| Manager  | manager@demo.sentinel.app   | `SentinelDemo!2026` |
| Employee | employee@demo.sentinel.app  | `SentinelDemo!2026` |

These are fixtures created by `packages/backend/scripts/seed.ts`, mirrored for
the frontend in `packages/frontend/src/lib/demoAccounts.ts`. They are
deliberately public and guard nothing but obviously fictional data; keep the
two files in step.

The seeded demo organisation is a mid-quarter snapshot of an SRA-regulated
firm: 14 controls across AML, Conduct, Client care, Client money, Records,
Training, Security, Governance and Resilience — each with a category and due
date — assignments in every state the UI can render, two saved import mapping
profiles, and one completed import run with mixed accepted and rejected rows
(processed through the real validation pipeline, so the stored checksums
verify). With `DEMO_MODE=true` each dashboard opens with a scenario card
naming your persona and what to try.

### Keeping the demo warm

The demo backend runs on Render's free tier, which spins the service down
after roughly 15 minutes of inactivity. A cold request has been measured at
25s and, at worst, over 60s — against ~2.7s warm.

`.github/workflows/keep-warm.yml` mitigates that: it pings `/health` every 10
minutes (and on `workflow_dispatch`, to wake the demo on demand before sending
a link). `/health` is the right target because it opens a real PostgreSQL
connection, so it warms the database pool as well as the Node process — a
static asset would wake only the container.

Read the honest limits in that file's header comments: GitHub's scheduled
triggers are best-effort and can be delayed under load, so this reduces cold
starts rather than eliminating them, and GitHub auto-disables scheduled
workflows on repositories with no activity for 60 days. The real fix is a host
without scale-to-zero.

The job fails (non-zero, red in the Actions tab) if `/health` does not return
200 after three attempts, so a genuine outage is visible rather than silently
swallowed. Set the repository variable `BACKEND_HEALTH_URL` to point it at a
different deployment.

### Try the demo in five minutes

1. **Sign in as the manager** — one click on *Sign in as Manager*, or
   `manager@demo.sentinel.app`. The guided tour starts on first login; the
   scenario card lists what to try.
2. **Review evidence.** Two submissions are waiting. One — client due
   diligence sampling — is a complete record: narrative, method, period,
   sample of 10 from 41, and where it is filed. The other is a bare
   "Checked — all fine."
3. **Run AI review on both.** Open each control and press *Request AI review*.
   The complete record returns a verdict with findings, each quoting the
   evidence — and the quotes are **highlighted in the evidence below**, so you
   can see exactly what was cited. The bare one returns an explicit
   insufficient-evidence result, because the citation check is enforced in
   application code rather than trusted to the model.
4. **Import controls.** Go to *Import*, download the sample file, and run a
   dry run: 9 rows accepted, 3 rejected with a specific reason each. Confirm,
   then expand the run in the history to see per-row checksums.
5. **Sign in as the admin** (`admin@demo.sentinel.app`) to see the
   organisation-wide picture, switch the review posture to *strict* and re-run
   a review to watch the tone change while the citation rules hold, and read
   the append-only audit log — which now contains everything you just did.
6. **Sign in as the employee** (`employee@demo.sentinel.app`) to see the other
   side: the evidence composer with its completeness meter, an overdue
   assignment, and a rejected submission with the reviewer's reason to revise
   and resubmit.

AI review requests only reach OpenAI if the deployment sets
`AI_FEATURE_ENABLED=true` with a real `OPENAI_API_KEY`; nothing at seed time
calls any API.

## Deployment

**Railway (backend + PostgreSQL)**

1. Provision a PostgreSQL service in Railway.
2. Create a service from this repo; set the Dockerfile path to
   `packages/backend/Dockerfile` (build context: repo root).
3. Environment variables: `DATABASE_URL` (from the Railway Postgres service),
   `SESSION_SECRET` (≥ 32 random characters), `NODE_ENV=production`,
   `FRONTEND_URL` (the Vercel URL). To enable AI review, additionally set
   `AI_FEATURE_ENABLED=true` and `OPENAI_API_KEY` (see
   [environment variables](#environment-variables)).
4. Health check path: `/health`. Migrations run automatically on boot.
5. Seed the demo org once: `railway run npm run seed` (from
   `packages/backend`). For a demo deployment also set `DEMO_MODE=true`, which
   turns on the scenario card and the one-click demo sign-in buttons. Leave it
   unset for a real customer deployment.

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
image build → dependency audit on production dependencies.

A second workflow, `.github/workflows/keep-warm.yml`, is operational rather
than gating: it keeps the free-tier demo backend awake and alerts on a real
outage. See [Keeping the demo warm](#keeping-the-demo-warm).

The audit step (`scripts/check-audit.js`) wraps `npm audit` rather than
calling it directly: it fails on any high/critical finding except advisories
on an explicit, dated, reasoned allowlist in that file. Today that list has
one entry — `GHSA-qwww-vcr4-c8h2` ("React Router: RSC Mode CSRF Bypass"),
present in every currently published `react-router-dom` release including
the latest. This app is a client-only SPA using only the declarative
`<BrowserRouter>`/`<Routes>`/`<Route>` API — never RSC, a data router, or
loaders/actions — so the vulnerable path is not reachable, and downgrading
below the vulnerable range was tested and found to reintroduce thirteen
*other* high-severity advisories that the current version already fixes.
Anything not on the allowlist still fails CI immediately.
