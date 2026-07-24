import { createTestContext, registerOrganisation, resetDatabase, TestContext } from '../helpers';

/**
 * Organisation isolation: data created in organisation A must be invisible
 * from organisation B — list responses are empty and direct object access
 * returns 404, indistinguishable from "does not exist".
 */
describe('organisation isolation', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.pool);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('data in org A is invisible and unreachable from org B', async () => {
    const orgA = await registerOrganisation(ctx.app, 'Org A');
    const orgB = await registerOrganisation(ctx.app, 'Org B');

    const created = await orgA.agent
      .post('/api/controls')
      .set('x-csrf-token', orgA.csrf)
      .send({ name: 'Org A confidential control', description: 'private' })
      .expect(201);
    const controlId = created.body.control.id as string;

    // Org A sees its control; org B's list is empty.
    const listA = await orgA.agent.get('/api/controls').expect(200);
    expect(listA.body.controls).toHaveLength(1);
    const listB = await orgB.agent.get('/api/controls').expect(200);
    expect(listB.body.controls).toHaveLength(0);

    // Direct access by ID from org B: 404, existence not revealed.
    await orgB.agent.get(`/api/controls/${controlId}`).expect(404);

    // Mutation attempts from org B also 404.
    await orgB.agent
      .patch(`/api/controls/${controlId}/status`)
      .set('x-csrf-token', orgB.csrf)
      .send({ status: 'passed' })
      .expect(404);

    // Org B cannot assign org A's control, even to its own admin.
    await orgB.agent
      .post('/api/assignments')
      .set('x-csrf-token', orgB.csrf)
      .send({ controlId, assigneeId: orgB.userId, dueDate: '2027-01-01' })
      .expect(404);

    // Org B cannot assign its own work to an org A user.
    const bControl = await orgB.agent
      .post('/api/controls')
      .set('x-csrf-token', orgB.csrf)
      .send({ name: 'Org B control' })
      .expect(201);
    await orgB.agent
      .post('/api/assignments')
      .set('x-csrf-token', orgB.csrf)
      .send({
        controlId: bControl.body.control.id,
        assigneeId: orgA.userId,
        dueDate: '2027-01-01',
      })
      .expect(404);

    // Audit logs are scoped: org B sees no trace of org A's control.
    const auditB = await orgB.agent.get('/api/audit').expect(200);
    const referenced = auditB.body.entries.map((e: { control_id: string | null }) => e.control_id);
    expect(referenced).not.toContain(controlId);

    // Underlying state check: org A's control is untouched.
    const verifyA = await orgA.agent.get(`/api/controls/${controlId}`).expect(200);
    expect(verifyA.body.control.status).toBe('pending');
  });
});
