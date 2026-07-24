import path from 'path';
import { Express } from 'express';
import { Pool } from 'pg';
import runner from 'node-pg-migrate';
import request from 'supertest';
import { buildApp } from '../src/app';
import { Config } from '../src/config';
import { logger } from '../src/logger';

/**
 * Integration test harness. Tests always run against a dedicated test
 * database (TEST_DATABASE_URL) — never the development or production one.
 * docker-compose provides it on port 5433; CI provides a service container.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://sentinel_test:sentinel_test@localhost:5433/sentinel_test';

export const TEST_CONFIG: Config = {
  databaseUrl: TEST_DATABASE_URL,
  sessionSecret: 'integration-test-session-secret-0123456789',
  nodeEnv: 'test',
  frontendUrl: 'http://localhost:5173',
  port: 0,
};

export interface TestContext {
  app: Express;
  pool: Pool;
  close(): Promise<void>;
}

export async function createTestContext(): Promise<TestContext> {
  await runner({
    databaseUrl: TEST_DATABASE_URL,
    dir: path.join(__dirname, '..', 'migrations'),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    count: Infinity,
    log: () => undefined,
  });

  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
  const silent = logger.child({}, { level: 'silent' });
  const app = buildApp(TEST_CONFIG, pool, silent);
  return {
    app,
    pool,
    close: async () => {
      await pool.end();
    },
  };
}

/** Truncates all application tables (TRUNCATE does not fire row triggers, so
 * the audit append-only trigger does not block test cleanup). */
export async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query(
    `TRUNCATE organisations, users, controls, assignments, invitations, audit_log, "session"
     RESTART IDENTITY CASCADE`
  );
}

export type Agent = ReturnType<typeof request.agent>;

/** Fetches (and thereby sets) the CSRF cookie, returning the token to echo
 * in the x-csrf-token header on state-changing requests. */
export async function getCsrfToken(agent: Agent): Promise<string> {
  const res = await agent.get('/api/csrf').expect(200);
  return res.body.csrfToken as string;
}

export interface RegisteredOrg {
  agent: Agent;
  csrf: string;
  userId: string;
  organisationId: string;
}

let orgCounter = 0;

/** Registers a fresh organisation with an admin session and returns an
 * authenticated agent. */
export async function registerOrganisation(
  app: Express,
  name?: string
): Promise<RegisteredOrg> {
  orgCounter += 1;
  const agent = request.agent(app);
  const csrf = await getCsrfToken(agent);
  const res = await agent
    .post('/api/auth/register')
    .set('x-csrf-token', csrf)
    .send({
      organisationName: name ?? `Test Org ${orgCounter}`,
      email: `admin-${Date.now()}-${orgCounter}@example.test`,
      password: 'correct-horse-battery',
      displayName: 'Test Admin',
    })
    .expect(201);
  return {
    agent,
    csrf,
    userId: res.body.user.id,
    organisationId: res.body.user.organisationId,
  };
}

/** Invites and registers a user with the given role in the admin's org,
 * returning an authenticated agent for the new user. */
export async function addUserToOrg(
  app: Express,
  admin: RegisteredOrg,
  role: 'admin' | 'manager' | 'employee'
): Promise<RegisteredOrg> {
  orgCounter += 1;
  const email = `${role}-${Date.now()}-${orgCounter}@example.test`;
  const inviteRes = await admin.agent
    .post('/api/invitations')
    .set('x-csrf-token', admin.csrf)
    .send({ email, role })
    .expect(201);

  const agent = request.agent(app);
  const csrf = await getCsrfToken(agent);
  const res = await agent
    .post('/api/auth/accept-invite')
    .set('x-csrf-token', csrf)
    .send({
      token: inviteRes.body.token,
      password: 'correct-horse-battery',
      displayName: `Test ${role}`,
    })
    .expect(201);
  return {
    agent,
    csrf,
    userId: res.body.user.id,
    organisationId: res.body.user.organisationId,
  };
}
