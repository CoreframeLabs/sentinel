import crypto from 'crypto';
import { RequestHandler } from 'express';
import { safeCompare } from '../lib/safeCompare';
import { Config } from '../config';

export const CSRF_COOKIE_NAME = 'sentinel_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection via the double-submit cookie pattern.
 *
 * A random token is issued in a cookie that is readable by the frontend
 * (deliberately NOT httpOnly — the client must be able to echo it) with
 * sameSite=strict. Every state-changing request (POST/PUT/PATCH/DELETE) must
 * repeat the token in the x-csrf-token header. A cross-site attacker can make
 * the browser send the cookie but cannot read it, so they cannot set the
 * matching header.
 *
 * The comparison uses safeCompare (crypto.timingSafeEqual) rather than ===
 * so response timing cannot be used to reconstruct the token byte by byte.
 *
 * There are no exempt routes: login and registration are protected too
 * (prevents login CSRF), which is why the token is issued on any request
 * rather than only after authentication. Clients bootstrap by calling
 * GET /api/csrf once before their first mutation.
 */
export function csrfProtection(nodeEnv: Config['nodeEnv']): RequestHandler {
  return (req, res, next) => {
    let cookieToken: string | undefined = req.cookies?.[CSRF_COOKIE_NAME];

    if (!cookieToken) {
      cookieToken = crypto.randomBytes(32).toString('hex');
      res.cookie(CSRF_COOKIE_NAME, cookieToken, {
        httpOnly: false,
        secure: nodeEnv === 'production',
        sameSite: 'strict',
        path: '/',
      });
      // Make the fresh token visible to this request's handlers (GET /api/csrf).
      req.cookies[CSRF_COOKIE_NAME] = cookieToken;
    }

    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const headerToken = req.get(CSRF_HEADER_NAME);
    if (!headerToken || !safeCompare(cookieToken, headerToken)) {
      res.status(403).json({ error: 'Invalid or missing CSRF token' });
      return;
    }
    next();
  };
}
