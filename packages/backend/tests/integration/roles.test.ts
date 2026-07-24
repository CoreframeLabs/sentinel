import {
  addUserToOrg,
  createTestContext,
  registerOrganisation,
  RegisteredOrg,
  resetDatabase,
  TestContext,
} from '../helpers';

describe('role permissions', () => {
  let ctx: TestContext;
  let admin: RegisteredOrg;
  let manager: RegisteredOrg;
  let employee: RegisteredOrg;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.pool);
    admin = await registerOrganisation(ctx.app);
    manager = await addUserToOrg(ctx.app, admin, 'manager');
    employee = await addUserToOrg(ctx.app, admin, 'employee');
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('employee cannot use manager or admin routes', async () => {
    await employee.agent
      .post('/api/controls')
      .set('x-csrf-token', employee.csrf)
      .send({ name: 'Not allowed' })
      .expect(403);
    await employee.agent
      .post('/api/assignments')
      .set('x-csrf-token', employee.csrf)
      .send({ controlId: employee.userId, assigneeId: employee.userId, dueDate: '2027-01-01' })
      .expect(403);
    await employee.agent.get('/api/admin/diagnostics').expect(403);
    await employee.agent
      .post('/api/invitations')
      .set('x-csrf-token', employee.csrf)
      .send({ email: 'x@example.test', role: 'employee' })
      .expect(403);
  });

  it('manager cannot use admin routes', async () => {
    await manager.agent
      .post('/api/controls')
      .set('x-csrf-token', manager.csrf)
      .send({ name: 'Not allowed' })
      .expect(403);
    await manager.agent.get('/api/admin/diagnostics').expect(403);
    await manager.agent
      .post('/api/invitations')
      .set('x-csrf-token', manager.csrf)
      .send({ email: 'x@example.test', role: 'employee' })
      .expect(403);
  });

  it('unauthenticated requests are rejected with 401', async () => {
    // A brand-new agent has a CSRF cookie but no session.
    const { agent } = await (async () => {
      const request = (await import('supertest')).default;
      const a = request.agent(ctx.app);
      await a.get('/api/csrf');
      return { agent: a };
    })();
    await agent.get('/api/controls').expect(401);
    await agent.get('/api/attention').expect(401);
    await agent.get('/api/audit').expect(401);
  });

  it('supports the full assignment lifecycle with correct role boundaries', async () => {
    const control = await admin.agent
      .post('/api/controls')
      .set('x-csrf-token', admin.csrf)
      .send({ name: 'Staff training completed', description: 'Annual training' })
      .expect(201);
    const controlId = control.body.control.id as string;

    const assignment = await manager.agent
      .post('/api/assignments')
      .set('x-csrf-token', manager.csrf)
      .send({ controlId, assigneeId: employee.userId, dueDate: '2027-03-01' })
      .expect(201);
    const assignmentId = assignment.body.assignment.id as string;

    // Employee sees it in their attention queue.
    const attention = await employee.agent.get('/api/attention').expect(200);
    expect(attention.body.role).toBe('employee');
    expect(attention.body.openAssignments.map((a: { id: string }) => a.id)).toContain(assignmentId);

    // Only the assignee can add evidence: the manager's attempt 404s
    // (assignee-scoped update matches no row).
    await manager.agent
      .post(`/api/assignments/${assignmentId}/evidence`)
      .set('x-csrf-token', manager.csrf)
      .send({ evidenceNote: 'not mine to write' })
      .expect(404);

    await employee.agent
      .post(`/api/assignments/${assignmentId}/evidence`)
      .set('x-csrf-token', employee.csrf)
      .send({ evidenceNote: 'Training register exported and filed.' })
      .expect(200);

    // Submitting without evidence is impossible for a different assignment,
    // but here evidence exists: submit moves the control to in_review.
    await employee.agent
      .post(`/api/assignments/${assignmentId}/submit`)
      .set('x-csrf-token', employee.csrf)
      .expect(200);
    const inReview = await admin.agent.get(`/api/controls/${controlId}`).expect(200);
    expect(inReview.body.control.status).toBe('in_review');

    // Employee cannot review their own submission.
    await employee.agent
      .post(`/api/assignments/${assignmentId}/review`)
      .set('x-csrf-token', employee.csrf)
      .send({ decision: 'accept' })
      .expect(403);

    // Manager rejects with a reason; control returns to pending.
    await manager.agent
      .post(`/api/assignments/${assignmentId}/review`)
      .set('x-csrf-token', manager.csrf)
      .send({ decision: 'reject', reason: 'Evidence does not cover new joiners.' })
      .expect(200);
    const rejected = await admin.agent.get(`/api/controls/${controlId}`).expect(200);
    expect(rejected.body.control.status).toBe('pending');

    // Employee revises and resubmits; manager accepts; control passes.
    await employee.agent
      .post(`/api/assignments/${assignmentId}/evidence`)
      .set('x-csrf-token', employee.csrf)
      .send({ evidenceNote: 'Updated register including new joiners.' })
      .expect(200);
    await employee.agent
      .post(`/api/assignments/${assignmentId}/submit`)
      .set('x-csrf-token', employee.csrf)
      .expect(200);
    await manager.agent
      .post(`/api/assignments/${assignmentId}/review`)
      .set('x-csrf-token', manager.csrf)
      .send({ decision: 'accept' })
      .expect(200);
    const passed = await admin.agent.get(`/api/controls/${controlId}`).expect(200);
    expect(passed.body.control.status).toBe('passed');

    // Admin attention view reflects the org-wide picture.
    const adminAttention = await admin.agent.get('/api/attention').expect(200);
    expect(adminAttention.body.role).toBe('admin');
    expect(adminAttention.body.statusSummary).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'passed' })])
    );
  });

  it('admin can access diagnostics', async () => {
    const res = await admin.agent.get('/api/admin/diagnostics').expect(200);
    expect(res.body.db_pool).toBeDefined();
    expect(res.body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });
});
