import crypto from 'crypto';

/**
 * Constant-time string comparison for tokens, invitation verifiers and CSRF
 * values.
 *
 * Why not ===: a naive comparison returns as soon as the first byte differs,
 * so response timing leaks how much of a secret an attacker has guessed.
 * crypto.timingSafeEqual compares every byte regardless of mismatches.
 *
 * timingSafeEqual throws when buffer lengths differ, which would itself leak
 * length information, so both inputs are first mapped to fixed-length SHA-256
 * digests. Two strings are equal iff their digests are equal.
 */
export function safeCompare(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const digestB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(digestA, digestB);
}
