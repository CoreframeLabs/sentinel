import rateLimit from 'express-rate-limit';
import { Logger } from '../logger';

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX = 10;

/**
 * Login rate limiter: 10 attempts per 15 minutes per IP. Hits are logged with
 * IP and timestamp only — never the request body, which contains credentials.
 */
export function createLoginRateLimiter(log: Logger) {
  return rateLimit({
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    limit: LOGIN_RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      log.warn({ ip: req.ip }, 'login_rate_limited');
      res.setHeader('Retry-After', String(Math.ceil(LOGIN_RATE_LIMIT_WINDOW_MS / 1000)));
      res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    },
  });
}
