import fs from 'fs';
import path from 'path';
import { BackupFile, serializeBackup, computeSha256 } from '../src/lib/backupFormat';
import { BACKUP_TABLES, createScriptPool, latestSchemaVersion, logLine } from './lib';

/**
 * Exports all application tables to a timestamped JSON file plus a .sha256
 * sidecar containing the file's hash, for integrity verification at restore
 * time. Usage:
 *
 *   DATABASE_URL=... npm run backup [-- <output-directory>]
 */
async function main(): Promise<void> {
  const outDir = process.argv[2] ?? path.join(process.cwd(), 'backups');
  const pool = createScriptPool();

  try {
    const backup: BackupFile = {
      format: 'sentinel-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      schemaVersion: await latestSchemaVersion(pool),
      tables: {},
    };

    for (const table of BACKUP_TABLES) {
      // Table names come from the fixed allowlist above, never from input.
      const result = await pool.query(`SELECT * FROM ${table} ORDER BY created_at ASC`);
      backup.tables[table] = result.rows;
    }

    fs.mkdirSync(outDir, { recursive: true });
    const timestamp = backup.createdAt.replace(/[:.]/g, '-');
    const filePath = path.join(outDir, `sentinel-backup-${timestamp}.json`);
    const content = serializeBackup(backup);
    const hash = computeSha256(content);

    fs.writeFileSync(filePath, content, 'utf8');
    fs.writeFileSync(`${filePath}.sha256`, `${hash}\n`, 'utf8');

    logLine('info', 'backup_completed', {
      file: filePath,
      sha256: hash,
      schema_version: backup.schemaVersion,
      row_counts: Object.fromEntries(
        Object.entries(backup.tables).map(([table, rows]) => [table, rows.length])
      ),
    });
  } catch (err) {
    logLine('error', 'backup_failed', {
      reason: err instanceof Error ? err.message : 'unknown',
    });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
