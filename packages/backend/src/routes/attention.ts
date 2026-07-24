import { Router } from 'express';
import { Pool } from 'pg';
import { requireAuth } from '../middleware/auth';
import * as assignmentsRepo from '../repositories/assignments';
import * as controlsRepo from '../repositories/controls';

/**
 * Role-scoped attention queue: each role sees only what requires their
 * action.
 */
export function attentionRouter(pool: Pool): Router {
  const router = Router();

  router.get('/attention', requireAuth, async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const today = new Date().toISOString().slice(0, 10);

      switch (req.session.role) {
        case 'employee': {
          const mine = await assignmentsRepo.listAssignmentsForAssignee(
            pool,
            organisationId,
            req.session.userId!
          );
          const open = mine.filter((a) => a.state === 'assigned' || a.state === 'rejected');
          res.json({
            role: 'employee',
            openAssignments: open,
            overdue: open.filter((a) => a.due_date < today),
            awaitingReview: mine.filter((a) => a.state === 'ready_for_review'),
          });
          return;
        }
        case 'manager': {
          const readyForReview = await assignmentsRepo.listAssignmentsInState(
            pool,
            organisationId,
            'ready_for_review'
          );
          res.json({ role: 'manager', readyForReview });
          return;
        }
        case 'admin': {
          const [statusSummary, all] = await Promise.all([
            controlsRepo.summarizeControlStatuses(pool, organisationId),
            assignmentsRepo.listAssignmentsByOrganisation(pool, organisationId),
          ]);
          const open = all.filter((a) => a.state === 'assigned' || a.state === 'rejected');
          res.json({
            role: 'admin',
            statusSummary,
            openAssignmentCount: open.length,
            overdueCount: open.filter((a) => a.due_date < today).length,
            readyForReviewCount: all.filter((a) => a.state === 'ready_for_review').length,
          });
          return;
        }
        default:
          res.status(403).json({ error: 'Insufficient permissions' });
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
