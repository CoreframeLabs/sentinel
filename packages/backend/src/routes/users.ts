import { Router } from 'express';
import { Pool } from 'pg';
import { Logger } from '../logger';
import { requireAuth } from '../middleware/auth';
import * as users from '../repositories/users';

/**
 * Lists members of the caller's organisation (for assignment pickers and the
 * team view). Password hashes never leave the repository layer's rows —
 * responses expose only id, display name, email and role.
 */
export function usersRouter(pool: Pool, log: Logger): Router {
  const router = Router();

  /** Marks the guided tour as seen for the calling user (finish or skip).
   * Self-scoped: the target user always comes from the session. */
  router.post('/users/me/tour-complete', requireAuth, async (req, res, next) => {
    try {
      const user = await users.markTourCompleted(
        pool,
        req.session.organisationId!,
        req.session.userId!
      );
      if (!user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      log.info(
        { user_id: user.id, org_id: user.organisation_id },
        'tour_completed'
      );
      res.json({ tourCompletedAt: user.tour_completed_at });
    } catch (err) {
      next(err);
    }
  });

  router.get('/users', requireAuth, async (req, res, next) => {
    try {
      const rows = await users.listUsersByOrganisation(pool, req.session.organisationId!);
      res.json({
        users: rows.map((u) => ({
          id: u.id,
          displayName: u.display_name,
          email: u.email,
          role: u.role,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
