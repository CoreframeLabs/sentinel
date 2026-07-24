import { Router } from 'express';
import { Pool } from 'pg';
import { requireAuth } from '../middleware/auth';
import * as auditLog from '../repositories/auditLog';

/**
 * Read-only view of the organisation's audit log. There are deliberately no
 * write routes: the log is append-only (application inserts happen inside
 * domain transactions) and immutable to all users including admins — a
 * database trigger rejects UPDATE and DELETE.
 */
export function auditRouter(pool: Pool): Router {
  const router = Router();

  router.get('/audit', requireAuth, async (req, res, next) => {
    try {
      const entries = await auditLog.listAuditEntries(pool, req.session.organisationId!);
      res.json({ entries });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
