import crypto from 'crypto';
import { safeCompare } from './safeCompare';

/**
 * Shared format helpers for the backup and restore scripts, kept in src so
 * they are unit-testable and compiled with the application.
 */

export interface BackupFile {
  format: 'sentinel-backup';
  version: 1;
  createdAt: string;
  /** Latest applied migration name at backup time. */
  schemaVersion: string;
  tables: Record<string, unknown[]>;
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export function computeSha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Verifies file content against an expected hash (as read from the .sha256
 * sidecar file). Comparison is constant-time via safeCompare; the hash is not
 * secret, but reusing the hardened comparison utility costs nothing.
 */
export function verifyBackupHash(content: string | Buffer, expectedHash: string): boolean {
  return safeCompare(computeSha256(content), expectedHash.trim().toLowerCase());
}

export function parseBackup(content: string): BackupFile {
  const parsed = JSON.parse(content) as BackupFile;
  if (parsed.format !== 'sentinel-backup' || parsed.version !== 1) {
    throw new Error('Not a recognised Sentinel backup file');
  }
  return parsed;
}
