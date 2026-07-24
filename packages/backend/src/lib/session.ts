import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { Config } from '../config';

/** Sessions expire 8 hours after creation. */
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export const SESSION_COOKIE_NAME = 'sentinel_sid';

export interface SessionCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict';
  maxAge: number;
  path: string;
}

/**
 * Session cookie policy:
 * - httpOnly: the session ID is never readable from JavaScript.
 * - secure in production: cookie is only sent over HTTPS.
 * - sameSite strict: the cookie is never attached to cross-site requests,
 *   which is the first layer of CSRF defence (the double-submit token is the
 *   second).
 */
export function buildSessionCookieOptions(nodeEnv: Config['nodeEnv']): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  };
}

/**
 * express-session backed by PostgreSQL (connect-pg-simple). Sessions are
 * stored in the "session" table — never in memory — so they survive process
 * restarts and horizontal scaling.
 */
export function buildSessionMiddleware(config: Config, pool: Pool) {
  const PgStore = connectPgSimple(session);
  return session({
    store: new PgStore({ pool, tableName: 'session' }),
    name: SESSION_COOKIE_NAME,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: buildSessionCookieOptions(config.nodeEnv),
  });
}
