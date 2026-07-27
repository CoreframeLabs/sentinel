import request from 'supertest';
import { createTestContext, TestContext } from '../helpers';

describe('GET /api/config', () => {
  let ctx: TestContext;

  afterEach(async () => {
    await ctx.close();
  });

  it('is readable without a session and reports demo mode off by default', async () => {
    ctx = await createTestContext();
    const res = await request(ctx.app).get('/api/config').expect(200);
    expect(res.body).toEqual({ demoMode: false });
  });

  it('reports demo mode when the deployment enables it', async () => {
    ctx = await createTestContext({ config: { demoMode: true } });
    const res = await request(ctx.app).get('/api/config').expect(200);
    expect(res.body).toEqual({ demoMode: true });
  });

  it('exposes nothing beyond the demo flag', async () => {
    ctx = await createTestContext({ config: { demoMode: true } });
    const res = await request(ctx.app).get('/api/config').expect(200);
    // Guards against a future edit leaking secrets or connection details
    // through this deliberately public endpoint.
    expect(Object.keys(res.body)).toEqual(['demoMode']);
  });
});
