import request from 'supertest';
import {
  createTestContext,
  getCsrfToken,
  registerOrganisation,
  resetDatabase,
  TestContext,
} from '../helpers';

describe('authentication', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.pool);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('registers an organisation and starts a session', async () => {
    const org = await registerOrganisation(ctx.app);
    const me = await org.agent.get('/api/auth/me').expect(200);
    expect(me.body.user.role).toBe('admin');
    expect(me.body.user.organisationId).toBe(org.organisationId);
  });

  it('sets httpOnly, sameSite=strict session cookies', async () => {
    const agent = request.agent(ctx.app);
    const csrf = await getCsrfToken(agent);
    const res = await agent
      .post('/api/auth/register')
      .set('x-csrf-token', csrf)
      .send({
        organisationName: 'Cookie Org',
        email: `cookie-${Date.now()}@example.test`,
        password: 'correct-horse-battery',
        displayName: 'Cookie Admin',
      })
      .expect(201);
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('sentinel_sid=')
    );
    expect(setCookie).toBeDefined();
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
  });

  it('logs in with correct credentials', async () => {
    const org = await registerOrganisation(ctx.app);
    const me = await org.agent.get('/api/auth/me').expect(200);

    const agent = request.agent(ctx.app);
    const csrf = await getCsrfToken(agent);
    await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: me.body.user.email, password: 'correct-horse-battery' })
      .expect(200);
    await agent.get('/api/auth/me').expect(200);
  });

  it('returns an identical error for wrong password and unknown email', async () => {
    const org = await registerOrganisation(ctx.app);
    const me = await org.agent.get('/api/auth/me').expect(200);

    const agent = request.agent(ctx.app);
    const csrf = await getCsrfToken(agent);
    const wrongPassword = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: me.body.user.email, password: 'incorrect-password' })
      .expect(401);
    const unknownEmail = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: 'nobody@example.test', password: 'incorrect-password' })
      .expect(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('destroys the session server-side on logout', async () => {
    const org = await registerOrganisation(ctx.app);
    const before = await ctx.pool.query('SELECT count(*)::int AS n FROM "session"');

    await org.agent.post('/api/auth/logout').set('x-csrf-token', org.csrf).expect(200);
    await org.agent.get('/api/auth/me').expect(401);

    const after = await ctx.pool.query('SELECT count(*)::int AS n FROM "session"');
    expect(after.rows[0].n).toBeLessThan(before.rows[0].n);
  });

  it('rejects a session after its stored expiry passes', async () => {
    const org = await registerOrganisation(ctx.app);
    await org.agent.get('/api/auth/me').expect(200);
    // Force-expire every session row rather than waiting 8 hours.
    await ctx.pool.query(`UPDATE "session" SET expire = now() - interval '1 minute'`);
    await org.agent.get('/api/auth/me').expect(401);
  });
});

describe('login rate limiting', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    // Fresh app instance so this test owns the whole rate-limit budget.
    ctx = await createTestContext();
    await resetDatabase(ctx.pool);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns 429 with Retry-After after 10 attempts per IP', async () => {
    const agent = request.agent(ctx.app);
    const csrf = await getCsrfToken(agent);

    for (let i = 0; i < 10; i += 1) {
      await agent
        .post('/api/auth/login')
        .set('x-csrf-token', csrf)
        .send({ email: 'nobody@example.test', password: 'incorrect-password' })
        .expect(401);
    }

    const limited = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: 'nobody@example.test', password: 'incorrect-password' })
      .expect(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
});
