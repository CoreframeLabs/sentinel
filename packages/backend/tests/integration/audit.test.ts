import {
  createTestContext,
  registerOrganisation,
  resetDatabase,
  TestContext,
} from '../helpers';

describe('audit log', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.pool);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('records state changes with IDs and action names, never content', async () => {
    const org = await registerOrganisation(ctx.app);
    const created = await org.agent
      .post('/api/controls')
      .set('x-csrf-token', org.csrf)
      .send({ name: 'Extremely Confidential Control Name', description: 'secret detail' })
      .expect(201);
    const controlId = created.body.control.id as string;

    await org.agent
      .patch(`/api/controls/${controlId}/status`)
      .set('x-csrf-token', org.csrf)
      .send({ status: 'deferred' })
      .expect(200);

    const audit = await org.agent.get('/api/audit').expect(200);
    const actions = audit.body.entries.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['control_created', 'control_status_deferred'])
    );

    const entry = audit.body.entries.find((e: { action: string }) => e.action === 'control_created');
    expect(entry.control_id).toBe(controlId);
    expect(entry.user_id).toBe(org.userId);
    expect(entry.organisation_id).toBe(org.organisationId);
    // No content data anywhere in the serialized log.
    expect(JSON.stringify(audit.body)).not.toContain('Extremely Confidential');
    expect(JSON.stringify(audit.body)).not.toContain('secret detail');
  });

  it('rejects UPDATE of audit entries at the database level', async () => {
    const org = await registerOrganisation(ctx.app);
    await org.agent
      .post('/api/controls')
      .set('x-csrf-token', org.csrf)
      .send({ name: 'Any control' })
      .expect(201);

    await expect(
      ctx.pool.query(`UPDATE audit_log SET action = 'tampered' WHERE organisation_id = $1`, [
        org.organisationId,
      ])
    ).rejects.toThrow(/append-only/);
  });

  it('rejects DELETE of audit entries at the database level', async () => {
    const org = await registerOrganisation(ctx.app);
    await expect(
      ctx.pool.query(`DELETE FROM audit_log WHERE organisation_id = $1`, [org.organisationId])
    ).rejects.toThrow(/append-only/);
  });

  it('exposes no write routes for the audit log', async () => {
    const org = await registerOrganisation(ctx.app);
    await org.agent
      .post('/api/audit')
      .set('x-csrf-token', org.csrf)
      .send({ action: 'fabricated' })
      .expect(404);
    await org.agent
      .delete('/api/audit')
      .set('x-csrf-token', org.csrf)
      .expect(404);
  });
});
