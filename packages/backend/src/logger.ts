import pino from 'pino';

/**
 * Structured, non-content logger.
 *
 * Every entry is JSON with an ISO 8601 UTC timestamp. Log the shape of data
 * (event names and IDs), never the content: no passwords, session tokens,
 * email addresses, display names, control names, or evidence text. The
 * redaction list below is defence in depth, not permission to pass sensitive
 * fields to the logger.
 */
export const logger = pino({
  timestamp: pino.stdTimeFunctions.isoTime,
  base: undefined,
  messageKey: 'event',
  redact: {
    paths: [
      'password',
      '*.password',
      'email',
      '*.email',
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
