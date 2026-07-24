import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createTestContext,
  registerOrganisation,
  resetDatabase,
  TestContext,
  TEST_DATABASE_URL,
} from '../helpers';

const BACKEND_ROOT = path.join(__dirname, '..', '..');
// npm workspaces hoist binaries to the repo root; fall back to the local
// node_modules for non-workspace checkouts.
const TSX_BIN = [
  path.join(BACKEND_ROOT, '..', '..', 'node_modules', '.bin', 'tsx'),
  path.join(BACKEND_ROOT, 'node_modules', '.bin', 'tsx'),
].find(fs.existsSync)!;

function runScript(script: string, args: string[]): { status: number; stdout: string } {
  try {
    const stdout = execFileSync(TSX_BIN, [path.join(BACKEND_ROOT, 'scripts', script), ...args], {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      encoding: 'utf8',
    });
    return { status: 0, stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? '' };
  }
}

describe('backup and restore', () => {
  let ctx: TestContext;
  let backupDir: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.pool);
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-backup-test-'));
  });

  afterAll(async () => {
    await ctx.close();
    fs.rmSync(backupDir, { recursive: true, force: true });
  });

  it('round-trips data through backup and restore with hash verification', async () => {
    const org = await registerOrganisation(ctx.app);
    await org.agent
      .post('/api/controls')
      .set('x-csrf-token', org.csrf)
      .send({ name: 'Backup fixture control', description: 'roundtrip' })
      .expect(201);

    const backup = runScript('backup.ts', [backupDir]);
    expect(backup.status).toBe(0);
    expect(backup.stdout).toContain('backup_completed');

    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(1);
    const backupFile = path.join(backupDir, files[0]!);
    expect(fs.existsSync(`${backupFile}.sha256`)).toBe(true);

    // Wipe and restore.
    await resetDatabase(ctx.pool);
    const empty = await ctx.pool.query('SELECT count(*)::int AS n FROM controls');
    expect(empty.rows[0].n).toBe(0);

    const restore = runScript('restore.ts', [backupFile]);
    expect(restore.status).toBe(0);
    expect(restore.stdout).toContain('restore_completed');

    const controls = await ctx.pool.query(
      'SELECT name, description FROM controls WHERE organisation_id = $1',
      [org.organisationId]
    );
    expect(controls.rows).toEqual([
      { name: 'Backup fixture control', description: 'roundtrip' },
    ]);
    const audit = await ctx.pool.query(
      'SELECT count(*)::int AS n FROM audit_log WHERE organisation_id = $1',
      [org.organisationId]
    );
    expect(audit.rows[0].n).toBeGreaterThan(0);
  });

  it('refuses to restore when the hash does not match', async () => {
    await resetDatabase(ctx.pool);
    await registerOrganisation(ctx.app);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-tamper-test-'));
    try {
      const backup = runScript('backup.ts', [dir]);
      expect(backup.status).toBe(0);
      const file = path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.json'))!);

      // Tamper with the backup content after hashing.
      const tampered = fs.readFileSync(file, 'utf8').replace('Test Org', 'Evil Org');
      fs.writeFileSync(file, tampered, 'utf8');

      const before = await ctx.pool.query('SELECT count(*)::int AS n FROM organisations');
      const restore = runScript('restore.ts', [file]);
      expect(restore.status).toBe(1);
      expect(restore.stdout).toContain('restore_hash_mismatch');
      // Nothing was imported.
      const after = await ctx.pool.query('SELECT count(*)::int AS n FROM organisations');
      expect(after.rows[0].n).toBe(before.rows[0].n);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
