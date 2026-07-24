import { Router } from 'express';
import { Pool } from 'pg';
import { healthCheck } from '../db';
import { Logger } from '../logger';

/**
 * Public health endpoint. Returns 200 when the database is reachable,
 * 503 when it is not. Exposes no internal detail beyond up/down.
 */
export function healthRouter(pool: Pool, log: Logger): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    try {
      await healthCheck(pool);
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch {
      log.error({}, 'health_check_failed');
      res.status(503).json({ status: 'unavailable', timestamp: new Date().toISOString() });
    }
  });

  return router;
}
