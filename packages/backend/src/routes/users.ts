import { Router } from 'express';
import { Pool } from 'pg';
import { requireAuth } from '../middleware/auth';
import * as users from '../repositories/users';

/**
 * Lists members of the caller's organisation (for assignment pickers and the
 * team view). Password hashes never leave the repository layer's rows —
 * responses expose only id, display name, email and role.
 */
export function usersRouter(pool: Pool): Router {
  const router = Router();

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
