import readline from 'readline';
import { createScriptPool, logLine } from './lib';

/**
 * Deletes an organisation and all of its data. Operator-only tool.
 *
 *   DATABASE_URL=... npm run delete-org -- <organisation-id>
 *
 * Behaviour:
 * 1. Lists exactly what will be deleted (row counts per table).
 * 2. Requires typing the organisation ID back to confirm.
 * 3. Deletes inside one transaction, children before parents.
 *
 * The deletion event is appended to the organisation's audit log before the
 * deletes run, as required — note that because the organisation's entire log
 * is itself removed (the foreign key on organisations demands it), the
 * durable record of the deletion is the structured operator log emitted here.
 * The audit DELETE is only possible because this transaction sets the
 * sentinel.allow_audit_delete flag that the append-only trigger checks; no
 * application code path ever sets it.
 */
async function main(): Promise<void> {
  const orgId = process.argv[2];
  if (!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) {
    logLine('error', 'delete_org_failed', { reason: 'Usage: npm run delete-org -- <organisation-uuid>' });
    process.exit(1);
  }

  const pool = createScriptPool();
  const client = await pool.connect();

  try {
    const org = await client.query('SELECT id FROM organisations WHERE id = $1', [orgId]);
    if (org.rowCount === 0) {
      logLine('error', 'delete_org_failed', { org_id: orgId, reason: 'Organisation not found' });
      process.exit(1);
    }

    const counts: Record<string, number> = {};
    for (const table of ['users', 'controls', 'assignments', 'invitations', 'audit_log']) {
      const result = await client.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE organisation_id = $1`,
        [orgId]
      );
      counts[table] = result.rows[0].n;
    }

    logLine('info', 'delete_org_preview', { org_id: orgId, row_counts: counts });
    process.stdout.write(
      `\nThis will permanently delete the organisation and all rows listed above.\n` +
        `Type the organisation ID to confirm: `
    );

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => rl.question('', resolve));
    rl.close();

    if (answer.trim() !== orgId) {
      logLine('info', 'delete_org_aborted', { org_id: orgId, reason: 'Confirmation did not match' });
      process.exit(0);
    }

    await client.query('BEGIN');
    await client.query(`SET LOCAL sentinel.allow_audit_delete = 'on'`);
    await client.query(
      `INSERT INTO audit_log (organisation_id, user_id, action, control_id)
       VALUES ($1, NULL, 'organisation_deleted', NULL)`,
      [orgId]
    );
    // Children before parents, respecting foreign keys.
    await client.query(`DELETE FROM "session" WHERE sess->>'organisationId' = $1`, [orgId]);
    await client.query('DELETE FROM assignments WHERE organisation_id = $1', [orgId]);
    await client.query('DELETE FROM invitations WHERE organisation_id = $1', [orgId]);
    await client.query('DELETE FROM controls WHERE organisation_id = $1', [orgId]);
    await client.query('DELETE FROM audit_log WHERE organisation_id = $1', [orgId]);
    await client.query('DELETE FROM users WHERE organisation_id = $1', [orgId]);
    await client.query('DELETE FROM organisations WHERE id = $1', [orgId]);
    await client.query('COMMIT');

    logLine('info', 'delete_org_completed', { org_id: orgId, row_counts: counts });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    logLine('error', 'delete_org_failed', {
      org_id: orgId,
      reason: err instanceof Error ? err.message : 'unknown',
    });
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
