import {
  generateInvitationToken,
  hashVerifier,
  parseInvitationToken,
} from '../../src/lib/invitationToken';

describe('invitation tokens', () => {
  it('round-trips: generated token parses back to selector + verifier', () => {
    const generated = generateInvitationToken();
    const parsed = parseInvitationToken(generated.token);
    expect(parsed).not.toBeNull();
    expect(parsed!.selector).toBe(generated.selector);
    expect(hashVerifier(parsed!.verifier)).toBe(generated.verifierHash);
  });

  it('stores only a hash of the verifier, never the verifier itself', () => {
    const generated = generateInvitationToken();
    expect(generated.token).not.toContain(generated.verifierHash);
    expect(generated.verifierHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique tokens', () => {
    expect(generateInvitationToken().token).not.toEqual(generateInvitationToken().token);
  });

  it('rejects malformed tokens', () => {
    expect(parseInvitationToken('no-separator')).toBeNull();
    expect(parseInvitationToken('too.many.parts')).toBeNull();
    expect(parseInvitationToken('.empty-selector')).toBeNull();
  });
});
