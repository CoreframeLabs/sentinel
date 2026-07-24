import request from 'supertest';
import {
  addUserToOrg,
  createTestContext,
  getCsrfToken,
  registerOrganisation,
  resetDatabase,
  TestContext,
} from '../helpers';

describe('guided tour state', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.pool);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('is unseen for a new user, marked per user, and survives a new session', async () => {
    const admin = await registerOrganisation(ctx.app);
    const manager = await addUserToOrg(ctx.app, admin, 'manager');

    // Fresh users have never seen the tour.
    const before = await admin.agent.get('/api/auth/me').expect(200);
    expect(before.body.user.tourCompletedAt).toBeNull();

    // Completing (or skipping) records a timestamp; repeat calls keep the
    // first one.
    const marked = await admin.agent
      .post('/api/users/me/tour-complete')
      .set('x-csrf-token', admin.csrf)
      .expect(200);
    expect(marked.body.tourCompletedAt).not.toBeNull();
    const again = await admin.agent
      .post('/api/users/me/tour-complete')
      .set('x-csrf-token', admin.csrf)
      .expect(200);
    expect(again.body.tourCompletedAt).toBe(marked.body.tourCompletedAt);

    // Per user: the manager in the same organisation is still unseen.
    const managerMe = await manager.agent.get('/api/auth/me').expect(200);
    expect(managerMe.body.user.tourCompletedAt).toBeNull();

    // Per user, not per browser/session: a fresh login sees the flag.
    const agent = request.agent(ctx.app);
    const csrf = await getCsrfToken(agent);
    const login = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: admin.email, password: 'correct-horse-battery' })
      .expect(200);
    expect(login.body.user.tourCompletedAt).toBe(marked.body.tourCompletedAt);
  });

  it('requires authentication', async () => {
    const agent = request.agent(ctx.app);
    const csrf = await getCsrfToken(agent);
    await agent.post('/api/users/me/tour-complete').set('x-csrf-token', csrf).expect(401);
  });
});
