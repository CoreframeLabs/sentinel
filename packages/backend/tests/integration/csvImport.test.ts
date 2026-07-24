import crypto from 'crypto';
import {
  addUserToOrg,
  createTestContext,
  registerOrganisation,
  RegisteredOrg,
  resetDatabase,
  TestContext,
} from '../helpers';

const MAPPING = {
  name: 'Control Name',
  description: 'Details',
  category: 'Category',
  due_date: 'Due Date',
};

const MIXED_CSV = [
  'Control Name,Details,Category,Due Date',
  'Access review,Quarterly review,Security,2099-01-15',
  ',Missing name,Ops,2099-01-15',
  'Past due,Old,Ops,2020-01-01',
  'Minimal,,,',
].join('\n');

function attachCsv(
  req: ReturnType<RegisteredOrg['agent']['post']>,
  content: string | Buffer,
  contentType = 'text/csv'
) {
  return req.attach('file', Buffer.isBuffer(content) ? content : Buffer.from(content), {
    filename: 'controls.csv',
    contentType,
  });
}

describe('CSV import', () => {
  let ctx: TestContext;
  let admin: RegisteredOrg;
  let manager: RegisteredOrg;
  let employee: RegisteredOrg;
  let otherOrg: RegisteredOrg;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.pool);
    admin = await registerOrganisation(ctx.app);
    manager = await addUserToOrg(ctx.app, admin, 'manager');
    employee = await addUserToOrg(ctx.app, admin, 'employee');
    otherOrg = await registerOrganisation(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('supports the full flow: parse, dry run, confirm, history, row results', async () => {
    // Step 1 — parse: headers plus preview, nothing persisted.
    const parsed = await attachCsv(
      manager.agent.post('/api/imports/parse').set('x-csrf-token', manager.csrf),
      MIXED_CSV
    ).expect(200);
    expect(parsed.body.headers).toEqual(['Control Name', 'Details', 'Category', 'Due Date']);
    expect(parsed.body.preview).toHaveLength(4);
    expect(parsed.body.totalRows).toBe(4);

    // Step 3 — dry run: correct split with specific reasons, no writes.
    const dryRun = await attachCsv(
      manager.agent.post('/api/imports/dry-run').set('x-csrf-token', manager.csrf),
      MIXED_CSV
    )
      .field('mapping', JSON.stringify(MAPPING))
      .expect(200);
    expect(dryRun.body).toMatchObject({ totalRows: 4, acceptedRows: 2, rejectedRows: 2 });
    expect(dryRun.body.rejections).toEqual([
      { rowNumber: 2, values: ['', 'Missing name', 'Ops', '2099-01-15'], reason: 'name is empty' },
      {
        rowNumber: 3,
        values: ['Past due', 'Old', 'Ops', '2020-01-01'],
        reason: 'due_date is not a future date',
      },
    ]);

    // Step 4 — confirm: controls created, run + row results recorded.
    const confirmed = await attachCsv(
      manager.agent.post('/api/imports/confirm').set('x-csrf-token', manager.csrf),
      MIXED_CSV
    )
      .field('mapping', JSON.stringify(MAPPING))
      .expect(201);
    const run = confirmed.body.importRun;
    expect(run).toMatchObject({ total_rows: 4, accepted_rows: 2, rejected_rows: 2 });
    expect(run.filename_checksum).toBe(
      crypto.createHash('sha256').update(Buffer.from(MIXED_CSV)).digest('hex')
    );

    const controls = await manager.agent.get('/api/controls').expect(200);
    expect(controls.body.controls).toHaveLength(2);
    const imported = controls.body.controls.find(
      (c: { name: string }) => c.name === 'Access review'
    );
    expect(imported).toMatchObject({
      description: 'Quarterly review',
      category: 'Security',
      due_date: '2099-01-15',
    });

    // Step 5 — history and per-run row results.
    const history = await admin.agent.get('/api/imports').expect(200);
    expect(history.body.importRuns).toHaveLength(1);
    expect(history.body.importRuns[0].id).toBe(run.id);

    const rows = await admin.agent.get(`/api/imports/${run.id}/rows`).expect(200);
    expect(rows.body.rows).toHaveLength(4);
    const byNumber = new Map(
      rows.body.rows.map((r: { row_number: number }) => [r.row_number, r])
    );
    expect(byNumber.get(1)).toMatchObject({ status: 'accepted', rejection_reason: null });
    expect((byNumber.get(1) as { control_id: string }).control_id).toBe(imported.id);
    expect(byNumber.get(2)).toMatchObject({ status: 'rejected', rejection_reason: 'name is empty' });

    // Audit trail: one import_run_created plus one control_created_by_import
    // per accepted row, each referencing the run.
    const audit = await admin.agent.get('/api/audit').expect(200);
    const runEntries = audit.body.entries.filter(
      (e: { action: string }) => e.action === 'import_run_created'
    );
    const controlEntries = audit.body.entries.filter(
      (e: { action: string }) => e.action === 'control_created_by_import'
    );
    expect(runEntries).toHaveLength(1);
    expect(runEntries[0].import_run_id).toBe(run.id);
    expect(controlEntries).toHaveLength(2);
    expect(controlEntries.every((e: { import_run_id: string }) => e.import_run_id === run.id)).toBe(
      true
    );
  });

  it('stores row checksums that match the SHA-256 of the original rows', async () => {
    const confirmed = await attachCsv(
      admin.agent.post('/api/imports/confirm').set('x-csrf-token', admin.csrf),
      MIXED_CSV
    )
      .field('mapping', JSON.stringify(MAPPING))
      .expect(201);

    const rows = await admin.agent
      .get(`/api/imports/${confirmed.body.importRun.id}/rows`)
      .expect(200);
    const expectedChecksums = [
      ['Access review', 'Quarterly review', 'Security', '2099-01-15'],
      ['', 'Missing name', 'Ops', '2099-01-15'],
      ['Past due', 'Old', 'Ops', '2020-01-01'],
      ['Minimal', '', '', ''],
    ].map((values) => crypto.createHash('sha256').update(values.join(',')).digest('hex'));
    const stored = [...rows.body.rows]
      .sort((a: { row_number: number }, b: { row_number: number }) => a.row_number - b.row_number)
      .map((r: { row_checksum: string }) => r.row_checksum);
    expect(stored).toEqual(expectedChecksums);
  });

  it('a dry run with no confirmation writes nothing', async () => {
    await attachCsv(
      manager.agent.post('/api/imports/dry-run').set('x-csrf-token', manager.csrf),
      MIXED_CSV
    )
      .field('mapping', JSON.stringify(MAPPING))
      .expect(200);

    const controls = await manager.agent.get('/api/controls').expect(200);
    expect(controls.body.controls).toHaveLength(0);
    const runs = await ctx.pool.query('SELECT count(*)::int AS n FROM csv_import_runs');
    expect(runs.rows[0].n).toBe(0);
  });

  it('confirm re-validates server-side and ignores client claims that rows passed', async () => {
    const confirmed = await attachCsv(
      manager.agent.post('/api/imports/confirm').set('x-csrf-token', manager.csrf),
      MIXED_CSV
    )
      .field('mapping', JSON.stringify(MAPPING))
      // A manipulated payload claiming every row validated successfully.
      .field('rowsPassed', JSON.stringify([1, 2, 3, 4]))
      .field('validationResults', JSON.stringify({ allAccepted: true }))
      .expect(201);

    expect(confirmed.body.importRun).toMatchObject({ accepted_rows: 2, rejected_rows: 2 });
    const controls = await manager.agent.get('/api/controls').expect(200);
    expect(controls.body.controls).toHaveLength(2);
  });

  it('rejects an import naming a different organisation with 403', async () => {
    await attachCsv(
      manager.agent.post('/api/imports/confirm').set('x-csrf-token', manager.csrf),
      MIXED_CSV
    )
      .field('mapping', JSON.stringify(MAPPING))
      .field('organisationId', otherOrg.organisationId)
      .expect(403);

    const other = await otherOrg.agent.get('/api/controls').expect(200);
    expect(other.body.controls).toHaveLength(0);
  });

  it('rejects files over 5MB with 413 before parsing', async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1024, 'a');
    await attachCsv(
      admin.agent.post('/api/imports/parse').set('x-csrf-token', admin.csrf),
      oversized
    ).expect(413);
  });

  it('rejects non-CSV uploads with 415', async () => {
    await attachCsv(
      admin.agent.post('/api/imports/parse').set('x-csrf-token', admin.csrf),
      'not,a\ncsv,really',
      'text/plain'
    ).expect(415);
  });

  it('blocks employees from every import endpoint', async () => {
    await attachCsv(
      employee.agent.post('/api/imports/parse').set('x-csrf-token', employee.csrf),
      MIXED_CSV
    ).expect(403);
    await attachCsv(
      employee.agent.post('/api/imports/dry-run').set('x-csrf-token', employee.csrf),
      MIXED_CSV
    ).expect(403);
    await attachCsv(
      employee.agent.post('/api/imports/confirm').set('x-csrf-token', employee.csrf),
      MIXED_CSV
    ).expect(403);
    await employee.agent.get('/api/imports').expect(403);
    await employee.agent.get('/api/import-profiles').expect(403);
    await employee.agent
      .post('/api/import-profiles')
      .set('x-csrf-token', employee.csrf)
      .send({ name: 'Nope', mapping: { name: 'Control Name' } })
      .expect(403);
  });

  it('scopes mapping profiles to the organisation', async () => {
    const created = await manager.agent
      .post('/api/import-profiles')
      .set('x-csrf-token', manager.csrf)
      .send({ name: 'Standard register', mapping: MAPPING })
      .expect(201);
    const profileId = created.body.profile.id;

    // Another organisation cannot see or use it: 404, not 403 — existence is
    // never revealed across tenants.
    await otherOrg.agent.get(`/api/import-profiles/${profileId}`).expect(404);
    await attachCsv(
      otherOrg.agent.post('/api/imports/confirm').set('x-csrf-token', otherOrg.csrf),
      MIXED_CSV
    )
      .field('mapping', JSON.stringify(MAPPING))
      .field('profileId', profileId)
      .expect(404);

    // Manager cannot delete profiles; admin can.
    await manager.agent
      .delete(`/api/import-profiles/${profileId}`)
      .set('x-csrf-token', manager.csrf)
      .expect(403);
    await admin.agent
      .delete(`/api/import-profiles/${profileId}`)
      .set('x-csrf-token', admin.csrf)
      .expect(204);
    await admin.agent.get(`/api/import-profiles/${profileId}`).expect(404);
  });

  it('records the profile used on the import run', async () => {
    const created = await manager.agent
      .post('/api/import-profiles')
      .set('x-csrf-token', manager.csrf)
      .send({ name: 'Standard register', mapping: MAPPING })
      .expect(201);
    const confirmed = await attachCsv(
      manager.agent.post('/api/imports/confirm').set('x-csrf-token', manager.csrf),
      MIXED_CSV
    )
      .field('mapping', JSON.stringify(MAPPING))
      .field('profileId', created.body.profile.id)
      .expect(201);
    expect(confirmed.body.importRun.profile_id).toBe(created.body.profile.id);

    // Deleting the profile detaches it from the run (ON DELETE SET NULL) but
    // the run's provenance counts stay immutable.
    await admin.agent
      .delete(`/api/import-profiles/${created.body.profile.id}`)
      .set('x-csrf-token', admin.csrf)
      .expect(204);
    const after = await admin.agent
      .get(`/api/imports/${confirmed.body.importRun.id}/rows`)
      .expect(200);
    expect(after.body.importRun).toMatchObject({
      profile_id: null,
      total_rows: 4,
      accepted_rows: 2,
      rejected_rows: 2,
    });
  });

  it('cross-organisation import history is invisible', async () => {
    const confirmed = await attachCsv(
      admin.agent.post('/api/imports/confirm').set('x-csrf-token', admin.csrf),
      MIXED_CSV
    )
      .field('mapping', JSON.stringify(MAPPING))
      .expect(201);

    const otherHistory = await otherOrg.agent.get('/api/imports').expect(200);
    expect(otherHistory.body.importRuns).toHaveLength(0);
    await otherOrg.agent.get(`/api/imports/${confirmed.body.importRun.id}/rows`).expect(404);
  });

  it('import runs and row results are append-only at the database level', async () => {
    const confirmed = await attachCsv(
      admin.agent.post('/api/imports/confirm').set('x-csrf-token', admin.csrf),
      MIXED_CSV
    )
      .field('mapping', JSON.stringify(MAPPING))
      .expect(201);
    const runId = confirmed.body.importRun.id;

    await expect(
      ctx.pool.query('UPDATE csv_import_runs SET accepted_rows = 99 WHERE id = $1', [runId])
    ).rejects.toThrow(/append-only/);
    await expect(
      ctx.pool.query('DELETE FROM csv_import_runs WHERE id = $1', [runId])
    ).rejects.toThrow(/append-only/);
    await expect(
      ctx.pool.query(
        `UPDATE csv_import_row_results SET status = 'accepted' WHERE import_run_id = $1`,
        [runId]
      )
    ).rejects.toThrow(/append-only/);
    await expect(
      ctx.pool.query('DELETE FROM csv_import_row_results WHERE import_run_id = $1', [runId])
    ).rejects.toThrow(/append-only/);
  });
});
