import request from 'supertest';
import { buildApp } from '../../src/app';
import { AiCompletion, AiReviewClient, AiUpstreamRateLimitError } from '../../src/lib/aiClient';
import { logger } from '../../src/logger';
import {
  addUserToOrg,
  createTestContext,
  getCsrfToken,
  registerOrganisation,
  RegisteredOrg,
  resetDatabase,
  TestContext,
  TEST_CONFIG,
} from '../helpers';

const EVIDENCE =
  'The access review was completed on 12 June and the results were archived in the compliance drive.';

/** Fake AI client: each test sets the next behaviour; nothing ever touches
 * the network. */
class FakeAiClient implements AiReviewClient {
  behaviour: () => Promise<AiCompletion> = async () => ({
    content: 'INSUFFICIENT_EVIDENCE',
    model: 'fake-model',
    promptTokens: 42,
    completionTokens: 7,
  });
  lastSystemPrompt: string | null = null;
  lastUserMessage: string | null = null;

  complete(systemPrompt: string, userMessage: string): Promise<AiCompletion> {
    this.lastSystemPrompt = systemPrompt;
    this.lastUserMessage = userMessage;
    return this.behaviour();
  }

  respondWith(content: string): void {
    this.behaviour = async () => ({
      content,
      model: 'fake-model',
      promptTokens: 42,
      completionTokens: 7,
    });
  }
}

const AI_TEST_CONFIG = {
  aiFeatureEnabled: true,
  openaiApiKey: 'test-key-never-used',
  aiRequestTimeoutMs: 250,
};

describe('bounded AI review', () => {
  let ctx: TestContext;
  let fake: FakeAiClient;
  let admin: RegisteredOrg;
  let manager: RegisteredOrg;
  let employee: RegisteredOrg;
  let otherOrg: RegisteredOrg;
  let controlId: string;

  beforeAll(async () => {
    fake = new FakeAiClient();
    ctx = await createTestContext({ config: AI_TEST_CONFIG, deps: { aiClient: fake } });
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** Creates a control with submitted evidence in the admin's organisation
   * and returns its ID. */
  async function createControlWithEvidence(): Promise<string> {
    const control = await admin.agent
      .post('/api/controls')
      .set('x-csrf-token', admin.csrf)
      .send({ name: 'Access control audit' })
      .expect(201);
    const assignment = await manager.agent
      .post('/api/assignments')
      .set('x-csrf-token', manager.csrf)
      .send({ controlId: control.body.control.id, assigneeId: employee.userId, dueDate: '2099-01-01' })
      .expect(201);
    await employee.agent
      .post(`/api/assignments/${assignment.body.assignment.id}/evidence`)
      .set('x-csrf-token', employee.csrf)
      .send({ evidenceNote: EVIDENCE })
      .expect(200);
    await employee.agent
      .post(`/api/assignments/${assignment.body.assignment.id}/submit`)
      .set('x-csrf-token', employee.csrf)
      .expect(200);
    return control.body.control.id as string;
  }

  async function enableAi(limits?: { user?: number; org?: number }): Promise<void> {
    await admin.agent
      .put('/api/admin/ai-settings')
      .set('x-csrf-token', admin.csrf)
      .send({
        enabled: true,
        maxRequestsPerUserPerDay: limits?.user ?? 10,
        maxRequestsPerOrgPerDay: limits?.org ?? 50,
      })
      .expect(200);
  }

  const requestReview = (id = controlId) =>
    manager.agent.post(`/api/controls/${id}/ai-review`).set('x-csrf-token', manager.csrf);

  beforeEach(async () => {
    await resetDatabase(ctx.pool);
    fake.respondWith('INSUFFICIENT_EVIDENCE');
    fake.lastSystemPrompt = null;
    fake.lastUserMessage = null;
    admin = await registerOrganisation(ctx.app);
    manager = await addUserToOrg(ctx.app, admin, 'manager');
    employee = await addUserToOrg(ctx.app, admin, 'employee');
    otherOrg = await registerOrganisation(ctx.app);
    controlId = await createControlWithEvidence();
  });

  it('returns 403 when the feature is disabled for the organisation', async () => {
    const res = await requestReview().expect(403);
    expect(res.body.error).toBe('AI review is not enabled for this organisation.');
    const rows = await ctx.pool.query('SELECT count(*)::int AS n FROM ai_interactions');
    expect(rows.rows[0].n).toBe(0);
  });

  it('is manager-only: employees and admins get 403', async () => {
    await enableAi();
    await employee.agent
      .post(`/api/controls/${controlId}/ai-review`)
      .set('x-csrf-token', employee.csrf)
      .expect(403);
    await admin.agent
      .post(`/api/controls/${controlId}/ai-review`)
      .set('x-csrf-token', admin.csrf)
      .expect(403);
  });

  it('only admins manage AI settings', async () => {
    await manager.agent
      .put('/api/admin/ai-settings')
      .set('x-csrf-token', manager.csrf)
      .send({ enabled: true, maxRequestsPerUserPerDay: 10, maxRequestsPerOrgPerDay: 50 })
      .expect(403);
    await manager.agent.get('/api/admin/ai-settings').expect(403);
    await manager.agent.get('/api/admin/ai-interactions').expect(403);
  });

  it('sends only the bounded prompt: the evidence note and nothing else', async () => {
    await enableAi();
    fake.respondWith('INSUFFICIENT_EVIDENCE');
    await requestReview().expect(200);
    expect(fake.lastUserMessage).toBe(`Evidence submitted for review: ${EVIDENCE}`);
    // No control name, org name or user identifiers leak into the prompt.
    expect(fake.lastUserMessage).not.toContain('Access control audit');
    expect(fake.lastSystemPrompt).toContain('compliance control reviewer');
  });

  it('returns a cited assessment when the response quotes the evidence verbatim', async () => {
    await enableAi();
    const response =
      'The control appears in place: "archived in the compliance drive" indicates retention.';
    fake.respondWith(response);
    const res = await requestReview().expect(200);
    expect(res.body.result).toEqual({ type: 'cited_assessment', assessment: response });

    const stored = await ctx.pool.query('SELECT * FROM ai_interactions');
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      response_type: 'cited_assessment',
      citations_present: true,
      model: 'fake-model',
      prompt_token_count: 42,
      completion_token_count: 7,
      error_code: null,
    });
    // Metadata only: no column of the stored row contains the evidence, the
    // prompt or the model response.
    for (const value of Object.values(stored.rows[0])) {
      if (typeof value !== 'string') continue;
      expect(value).not.toContain('archived in the compliance drive');
      expect(value).not.toContain(EVIDENCE);
    }
  });

  it('treats a response with no valid citation as insufficient evidence', async () => {
    await enableAi();
    fake.respondWith('Clearly fine because "the CFO signed it off" last week.');
    const res = await requestReview().expect(200);
    expect(res.body.result.type).toBe('insufficient_evidence');
    const stored = await ctx.pool.query('SELECT response_type, citations_present FROM ai_interactions');
    expect(stored.rows[0]).toEqual({ response_type: 'insufficient_evidence', citations_present: false });
  });

  it('handles an explicit INSUFFICIENT_EVIDENCE response', async () => {
    await enableAi();
    fake.respondWith('INSUFFICIENT_EVIDENCE');
    const res = await requestReview().expect(200);
    expect(res.body.result).toEqual({
      type: 'insufficient_evidence',
      message: 'The submitted evidence does not contain sufficient information to support an assessment.',
    });
  });

  it('404s for a control belonging to a different organisation', async () => {
    await enableAi();
    const otherManager = await addUserToOrg(ctx.app, otherOrg, 'manager');
    await otherManager.agent
      .put('/api/admin/ai-settings')
      .set('x-csrf-token', otherManager.csrf)
      .expect(403); // sanity: manager cannot enable
    await otherOrg.agent
      .put('/api/admin/ai-settings')
      .set('x-csrf-token', otherOrg.csrf)
      .send({ enabled: true, maxRequestsPerUserPerDay: 10, maxRequestsPerOrgPerDay: 50 })
      .expect(200);
    // The other org's manager names our control: evidence is fetched with
    // their organisation ID, so nothing is found and no prompt is built.
    await otherManager.agent
      .post(`/api/controls/${controlId}/ai-review`)
      .set('x-csrf-token', otherManager.csrf)
      .expect(404);
    expect(fake.lastUserMessage).toBeNull();
  });

  it('enforces the per-user daily limit from the database', async () => {
    await enableAi({ user: 2, org: 50 });
    await requestReview().expect(200);
    await requestReview().expect(200);
    const limited = await requestReview().expect(429);
    expect(limited.body.error).toMatch(/rate limit/i);

    const stored = await ctx.pool.query(
      `SELECT count(*)::int AS n FROM ai_interactions WHERE response_type = 'rate_limited'`
    );
    expect(stored.rows[0].n).toBe(1);
  });

  it('enforces the per-organisation daily limit', async () => {
    await enableAi({ user: 10, org: 1 });
    await requestReview().expect(200);
    await requestReview().expect(429);
  });

  it('rate limits survive a server restart because counts live in the database', async () => {
    await enableAi({ user: 1, org: 50 });
    await requestReview().expect(200);
    await requestReview().expect(429);

    // A fresh app process (same database) still refuses: nothing about the
    // limit lives in process memory.
    const silent = logger.child({}, { level: 'silent' });
    const restartedApp = buildApp(
      { ...TEST_CONFIG, ...AI_TEST_CONFIG },
      ctx.pool,
      silent,
      { aiClient: fake }
    );
    const agent = request.agent(restartedApp);
    const csrf = await getCsrfToken(agent);
    await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: manager.email, password: 'correct-horse-battery' })
      .expect(200);
    await agent
      .post(`/api/controls/${controlId}/ai-review`)
      .set('x-csrf-token', csrf)
      .expect(429);
  });

  it('times out a hanging AI call with 503 and records an error interaction', async () => {
    await enableAi();
    fake.behaviour = () => new Promise<never>(() => undefined); // hangs forever
    await requestReview().expect(503);
    const stored = await ctx.pool.query('SELECT response_type, error_code FROM ai_interactions');
    expect(stored.rows[0]).toEqual({ response_type: 'error', error_code: 'timeout' });
  });

  it('maps an upstream 429 to 503 with error_code upstream_rate_limited', async () => {
    await enableAi();
    fake.behaviour = () => Promise.reject(new AiUpstreamRateLimitError());
    await requestReview().expect(503);
    const stored = await ctx.pool.query('SELECT response_type, error_code FROM ai_interactions');
    expect(stored.rows[0]).toEqual({ response_type: 'error', error_code: 'upstream_rate_limited' });
  });

  it('ai_interactions is append-only at the database level', async () => {
    await enableAi();
    fake.respondWith('INSUFFICIENT_EVIDENCE');
    await requestReview().expect(200);
    const row = await ctx.pool.query('SELECT id FROM ai_interactions LIMIT 1');
    await expect(
      ctx.pool.query('UPDATE ai_interactions SET citations_present = true WHERE id = $1', [
        row.rows[0].id,
      ])
    ).rejects.toThrow(/append-only/);
    await expect(
      ctx.pool.query('DELETE FROM ai_interactions WHERE id = $1', [row.rows[0].id])
    ).rejects.toThrow(/append-only/);
  });

  it('admins see interaction metadata history', async () => {
    await enableAi();
    fake.respondWith('INSUFFICIENT_EVIDENCE');
    await requestReview().expect(200);
    const res = await admin.agent.get('/api/admin/ai-interactions').expect(200);
    expect(res.body.interactions).toHaveLength(1);
    expect(res.body.interactions[0]).toMatchObject({
      control_id: controlId,
      response_type: 'insufficient_evidence',
    });
    expect(Object.keys(res.body.interactions[0])).not.toEqual(
      expect.arrayContaining(['content', 'prompt', 'response', 'evidence'])
    );
  });

  it('returns 503 when the deployment has no AI configured, even if an org enables it', async () => {
    // Build an app with AI_FEATURE_ENABLED=false against the same database.
    const silent = logger.child({}, { level: 'silent' });
    const noAiApp = buildApp(TEST_CONFIG, ctx.pool, silent);
    await enableAi();
    const agent = request.agent(noAiApp);
    const csrf = await getCsrfToken(agent);
    await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: manager.email, password: 'correct-horse-battery' })
      .expect(200);
    await agent
      .post(`/api/controls/${controlId}/ai-review`)
      .set('x-csrf-token', csrf)
      .expect(503);
  });
});
