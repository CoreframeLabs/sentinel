import { Router } from 'express';
import { Pool } from 'pg';
import { poolStats } from '../db';
import { requireRole } from '../middleware/auth';

/**
 * Admin-only diagnostics: connection pool stats and process uptime.
 * Protected by role, not by obscurity.
 */
export function adminRouter(pool: Pool): Router {
  const router = Router();

  router.get('/admin/diagnostics', requireRole('admin'), (_req, res) => {
    res.json({
      db_pool: poolStats(pool),
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
