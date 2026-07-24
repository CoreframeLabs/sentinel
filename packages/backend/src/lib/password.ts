import bcrypt from 'bcrypt';

/**
 * bcrypt cost factor. 12 rounds is the project minimum; do not lower this to
 * speed up tests — tests that need speed should stub at a higher level.
 */
export const BCRYPT_ROUNDS = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

/**
 * bcrypt.compare re-derives the hash and compares internally; its runtime
 * depends on the cost factor, not on where the strings differ, so it is not
 * vulnerable to a position-based timing oracle.
 */
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
