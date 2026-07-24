import {
  BackupFile,
  computeSha256,
  parseBackup,
  serializeBackup,
  verifyBackupHash,
} from '../../src/lib/backupFormat';

const sample: BackupFile = {
  format: 'sentinel-backup',
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  schemaVersion: '0003_audit-append-only',
  tables: { organisations: [{ id: 'x' }] },
};

describe('backup hash generation and verification', () => {
  it('computes a stable SHA-256 hex digest', () => {
    expect(computeSha256('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('verifies serialized content against its own hash', () => {
    const content = serializeBackup(sample);
    const hash = computeSha256(content);
    expect(verifyBackupHash(content, hash)).toBe(true);
    expect(verifyBackupHash(content, `${hash}\n`)).toBe(true);
  });

  it('rejects tampered content', () => {
    const content = serializeBackup(sample);
    const hash = computeSha256(content);
    expect(verifyBackupHash(content.replace('organisations', 'organisationz'), hash)).toBe(false);
  });

  it('round-trips through parseBackup', () => {
    expect(parseBackup(serializeBackup(sample))).toEqual(sample);
  });

  it('rejects files that are not sentinel backups', () => {
    expect(() => parseBackup(JSON.stringify({ format: 'other', version: 1 }))).toThrow(
      'Not a recognised Sentinel backup file'
    );
  });
});
