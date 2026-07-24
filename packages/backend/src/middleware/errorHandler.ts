import { ErrorRequestHandler } from 'express';
import { Logger } from '../logger';
import { Config } from '../config';

/**
 * Final error handler. The full error (message and stack) is logged
 * internally; the client receives a generic message in production so stack
 * traces and internal details never cross the wire.
 */
export function errorHandler(log: Logger, nodeEnv: Config['nodeEnv']): ErrorRequestHandler {
  return (err, req, res, next) => {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log.error({ err_message: message, stack, method: req.method, path: req.path }, 'unhandled_error');

    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(500).json({
      error: nodeEnv === 'production' ? 'Internal server error' : message,
    });
  };
}
