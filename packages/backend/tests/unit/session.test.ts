import { buildSessionCookieOptions, SESSION_MAX_AGE_MS } from '../../src/lib/session';

describe('session cookie policy', () => {
  it('expires sessions after 8 hours', () => {
    expect(SESSION_MAX_AGE_MS).toBe(8 * 60 * 60 * 1000);
  });

  it('is httpOnly and sameSite=strict in every environment', () => {
    for (const env of ['development', 'production', 'test'] as const) {
      const options = buildSessionCookieOptions(env);
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('strict');
      expect(options.maxAge).toBe(SESSION_MAX_AGE_MS);
    }
  });

  it('requires HTTPS (secure) in production only', () => {
    expect(buildSessionCookieOptions('production').secure).toBe(true);
    expect(buildSessionCookieOptions('development').secure).toBe(false);
  });
});
