import fs from 'fs';
import { parseBackup, verifyBackupHash } from '../src/lib/backupFormat';
import { BACKUP_TABLES, createScriptPool, latestSchemaVersion, logLine } from './lib';

/**
 * Restores a backup produced by scripts/backup.ts. The file's SHA-256 hash is
 * verified against the .sha256 sidecar BEFORE anything touches the database;
 * a mismatch aborts immediately — a corrupt backup is never imported.
 *
 *   DATABASE_URL=... npm run restore -- <backup-file.json>
 */
async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    logLine('error', 'restore_failed', { reason: 'Usage: npm run restore -- <backup-file.json>' });
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const expectedHash = fs.readFileSync(`${filePath}.sha256`, 'utf8');

  if (!verifyBackupHash(content, expectedHash)) {
    logLine('error', 'restore_hash_mismatch', {
      file: filePath,
      reason: 'SHA-256 hash does not match .sha256 sidecar; refusing to restore',
    });
    process.exit(1);
  }

  const backup = parseBackup(content);
  const pool = createScriptPool();
  const client = await pool.connect();

  try {
    const currentSchema = await latestSchemaVersion(pool);
    if (backup.schemaVersion !== currentSchema) {
      logLine('error', 'restore_schema_mismatch', {
        backup_schema: backup.schemaVersion,
        database_schema: currentSchema,
        reason: 'Run migrations to the matching version before restoring',
      });
      process.exit(1);
    }

    await client.query('BEGIN');
    // The audit log trigger blocks nothing here — restore only inserts.
    const inserted: Record<string, number> = {};
    for (const table of BACKUP_TABLES) {
      const rows = (backup.tables[table] ?? []) as Record<string, unknown>[];
      inserted[table] = 0;
      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        // audit_log.id is GENERATED ALWAYS; restoring historical IDs
        // requires OVERRIDING SYSTEM VALUE.
        const overriding = table === 'audit_log' ? 'OVERRIDING SYSTEM VALUE' : '';
        const result = await client.query(
          `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(', ')})
           ${overriding} VALUES (${placeholders})
           ON CONFLICT (id) DO NOTHING`,
          columns.map((c) => row[c])
        );
        inserted[table] += result.rowCount ?? 0;
      }
    }
    // Realign the identity sequence after explicit ID inserts.
    await client.query(
      `SELECT setval(pg_get_serial_sequence('audit_log', 'id'),
                     COALESCE((SELECT max(id) FROM audit_log), 1))`
    );
    await client.query('COMMIT');

    logLine('info', 'restore_completed', {
      file: filePath,
      schema_version: backup.schemaVersion,
      inserted_rows: inserted,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    logLine('error', 'restore_failed', {
      reason: err instanceof Error ? err.message : 'unknown',
    });
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
