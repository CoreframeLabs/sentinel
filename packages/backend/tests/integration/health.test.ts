import { createTestContext, TestContext } from '../helpers';

describe('health endpoint', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns 200 with status ok while the database is reachable', async () => {
    const request = (await import('supertest')).default;
    const res = await request(ctx.app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
  });
});
