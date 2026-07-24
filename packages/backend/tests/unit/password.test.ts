import { BCRYPT_ROUNDS, hashPassword, verifyPassword } from '../../src/lib/password';

describe('password hashing', () => {
  it('hashes with bcrypt at the configured cost factor', async () => {
    const hash = await hashPassword('a-strong-passphrase');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(BCRYPT_ROUNDS).toBeGreaterThanOrEqual(12);
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('a-strong-passphrase');
    await expect(verifyPassword('a-strong-passphrase', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('a-strong-passphrase');
    await expect(verifyPassword('a-wrong-passphrase', hash)).resolves.toBe(false);
  });

  it('produces unique salts per hash', async () => {
    const [h1, h2] = await Promise.all([
      hashPassword('same-input'),
      hashPassword('same-input'),
    ]);
    expect(h1).not.toEqual(h2);
  });
});
