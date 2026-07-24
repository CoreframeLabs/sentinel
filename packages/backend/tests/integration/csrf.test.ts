import request from 'supertest';
import {
  createTestContext,
  getCsrfToken,
  registerOrganisation,
  resetDatabase,
  TestContext,
} from '../helpers';

describe('CSRF protection', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.pool);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('rejects state-changing requests without a CSRF token', async () => {
    const agent = request.agent(ctx.app);
    await getCsrfToken(agent); // cookie is set, but no header will be sent
    await agent
      .post('/api/auth/login')
      .send({ email: 'nobody@example.test', password: 'whatever-password' })
      .expect(403);
  });

  it('rejects state-changing requests with a mismatched token', async () => {
    const agent = request.agent(ctx.app);
    await getCsrfToken(agent);
    await agent
      .post('/api/auth/login')
      .set('x-csrf-token', 'not-the-real-token')
      .send({ email: 'nobody@example.test', password: 'whatever-password' })
      .expect(403);
  });

  it('rejects authenticated mutations without the token', async () => {
    const org = await registerOrganisation(ctx.app);
    await org.agent
      .post('/api/controls')
      .send({ name: 'Should be rejected' })
      .expect(403);
  });

  it('accepts requests that echo the cookie token in the header', async () => {
    const org = await registerOrganisation(ctx.app);
    await org.agent
      .post('/api/controls')
      .set('x-csrf-token', org.csrf)
      .send({ name: 'Quarterly access review' })
      .expect(201);
  });
});
