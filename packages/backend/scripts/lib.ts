import 'dotenv/config';
import { Pool } from 'pg';

/**
 * Shared helpers for operator scripts. Scripts require only DATABASE_URL —
 * they fail closed with exit code 1 when it is missing, like the server.
 */

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    logLine('error', 'config_invalid', { reason: 'Missing required environment variable: DATABASE_URL' });
    process.exit(1);
  }
  return url;
}

export function createScriptPool(): Pool {
  return new Pool({ connectionString: requireDatabaseUrl(), max: 2 });
}

/** Structured JSON log line to stdout; never include content or secrets. */
export function logLine(
  level: 'info' | 'error',
  event: string,
  fields: Record<string, unknown> = {}
): void {
  process.stdout.write(
    JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }) + '\n'
  );
}

/** Tables included in backups, in foreign-key-safe insert order. The session
 * table is deliberately excluded: live session identifiers are secrets. */
export const BACKUP_TABLES = [
  'organisations',
  'users',
  'controls',
  'assignments',
  'invitations',
  'audit_log',
  'csv_import_profiles',
  'csv_import_runs',
  'csv_import_row_results',
  'ai_feature_settings',
  'ai_interactions',
] as const;

export async function latestSchemaVersion(pool: Pool): Promise<string> {
  const result = await pool.query<{ name: string }>(
    'SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1'
  );
  return result.rows[0]?.name ?? 'none';
}
