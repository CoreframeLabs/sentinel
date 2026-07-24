import crypto from 'crypto';

/**
 * Invitation tokens use a selector/verifier split. The full token handed to
 * the invitee is "<selector>.<verifier>". The selector is stored in plaintext
 * and used for the indexed database lookup; only a SHA-256 hash of the
 * verifier is stored. Accepting an invitation looks up by selector and then
 * compares verifier hashes in constant time — the database equality check is
 * never used to compare the secret part.
 */

export interface GeneratedInvitationToken {
  token: string;
  selector: string;
  verifierHash: string;
}

export function generateInvitationToken(): GeneratedInvitationToken {
  const selector = crypto.randomBytes(9).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  return {
    token: `${selector}.${verifier}`,
    selector,
    verifierHash: hashVerifier(verifier),
  };
}

export function hashVerifier(verifier: string): string {
  return crypto.createHash('sha256').update(verifier, 'utf8').digest('hex');
}

export function parseInvitationToken(
  token: string
): { selector: string; verifier: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { selector: parts[0], verifier: parts[1] };
}
