import {
  addUserToOrg,
  createTestContext,
  registerOrganisation,
  RegisteredOrg,
  resetDatabase,
  TestContext,
} from '../helpers';

describe('structured evidence', () => {
  let ctx: TestContext;
  let admin: RegisteredOrg;
  let manager: RegisteredOrg;
  let employee: RegisteredOrg;
  let assignmentId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.pool);
    admin = await registerOrganisation(ctx.app);
    manager = await addUserToOrg(ctx.app, admin, 'manager');
    employee = await addUserToOrg(ctx.app, admin, 'employee');

    const control = await admin.agent
      .post('/api/controls')
      .set('x-csrf-token', admin.csrf)
      .send({ name: 'Client due diligence sampled' })
      .expect(201);
    const assignment = await manager.agent
      .post('/api/assignments')
      .set('x-csrf-token', manager.csrf)
      .send({
        controlId: control.body.control.id,
        assigneeId: employee.userId,
        dueDate: '2099-01-01',
      })
      .expect(201);
    assignmentId = assignment.body.assignment.id;
  });

  const postEvidence = (body: Record<string, unknown>) =>
    employee.agent
      .post(`/api/assignments/${assignmentId}/evidence`)
      .set('x-csrf-token', employee.csrf)
      .send(body);

  it('stores the full structured record', async () => {
    const res = await postEvidence({
      evidenceNote: 'Sampled 10 files; all held certified ID.',
      method: 'inspection',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
      sampleSize: 10,
      population: 41,
      location: 'Compliance/2026/Q2.xlsx',
    }).expect(200);

    expect(res.body.assignment).toMatchObject({
      evidence_note: 'Sampled 10 files; all held certified ID.',
      evidence_method: 'inspection',
      evidence_period_start: '2026-04-01',
      evidence_period_end: '2026-06-30',
      evidence_sample_size: 10,
      evidence_population: 41,
      evidence_location: 'Compliance/2026/Q2.xlsx',
    });
  });

  it('accepts a narrative-only record, leaving the structured fields null', async () => {
    const res = await postEvidence({ evidenceNote: 'Checked and filed.' }).expect(200);
    expect(res.body.assignment).toMatchObject({
      evidence_note: 'Checked and filed.',
      evidence_method: null,
      evidence_period_start: null,
      evidence_sample_size: null,
      evidence_location: null,
    });
  });

  it('clears previously supplied fields when evidence is revised without them', async () => {
    await postEvidence({
      evidenceNote: 'First attempt.',
      method: 'inspection',
      sampleSize: 5,
      population: 10,
    }).expect(200);
    // A revision must not silently inherit the earlier structured values.
    const res = await postEvidence({ evidenceNote: 'Revised, narrative only.' }).expect(200);
    expect(res.body.assignment).toMatchObject({
      evidence_note: 'Revised, narrative only.',
      evidence_method: null,
      evidence_sample_size: null,
      evidence_population: null,
    });
  });

  it('rejects each invalid field with a specific message', async () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ method: 'guesswork' }, /method must be one of/],
      [{ periodStart: '01-04-2026' }, /periodStart must be a date/],
      [{ periodEnd: 'last quarter' }, /periodEnd must be a date/],
      [{ periodStart: '2026-06-30', periodEnd: '2026-04-01' }, /periodStart must not be after/],
      [{ sampleSize: -1 }, /sampleSize must be a whole number/],
      [{ sampleSize: 1.5 }, /sampleSize must be a whole number/],
      [{ population: 'lots' }, /population must be a whole number/],
      [{ sampleSize: 50, population: 10 }, /sampleSize must not exceed population/],
    ];
    for (const [fields, expected] of cases) {
      const res = await postEvidence({ evidenceNote: 'Valid note.', ...fields }).expect(400);
      expect(res.body.error).toMatch(expected);
    }
  });

  it('still requires a narrative summary', async () => {
    await postEvidence({ method: 'inspection', sampleSize: 10 }).expect(400);
    await postEvidence({ evidenceNote: '   ' }).expect(400);
  });

  it('only the assignee can record evidence', async () => {
    await manager.agent
      .post(`/api/assignments/${assignmentId}/evidence`)
      .set('x-csrf-token', manager.csrf)
      .send({ evidenceNote: 'Not mine to write.', method: 'inquiry' })
      .expect(404);
  });
});
