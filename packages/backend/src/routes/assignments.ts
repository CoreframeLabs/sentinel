import { Router } from 'express';
import { Pool } from 'pg';
import { Logger } from '../logger';
import { withTransaction } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import * as assignmentsRepo from '../repositories/assignments';
import * as controlsRepo from '../repositories/controls';
import * as usersRepo from '../repositories/users';
import * as auditLog from '../repositories/auditLog';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assignmentsRouter(pool: Pool, log: Logger): Router {
  const router = Router();

  router.get('/assignments', requireAuth, async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const rows =
        req.session.role === 'employee'
          ? await assignmentsRepo.listAssignmentsForAssignee(
              pool,
              organisationId,
              req.session.userId!
            )
          : await assignmentsRepo.listAssignmentsByOrganisation(pool, organisationId);
      res.json({ assignments: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post('/assignments', requireRole('admin', 'manager'), async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const { controlId, assigneeId, dueDate } = req.body ?? {};
      if (
        typeof controlId !== 'string' ||
        !UUID_RE.test(controlId) ||
        typeof assigneeId !== 'string' ||
        !UUID_RE.test(assigneeId) ||
        typeof dueDate !== 'string' ||
        !DATE_RE.test(dueDate)
      ) {
        res.status(400).json({ error: 'controlId, assigneeId and dueDate (YYYY-MM-DD) are required' });
        return;
      }

      // Both lookups are organisation-scoped: a control or user belonging to
      // another organisation resolves to null and the request 404s.
      const control = await controlsRepo.findControlById(pool, organisationId, controlId);
      const assignee = await usersRepo.findUserById(pool, organisationId, assigneeId);
      if (!control || !assignee) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      const assignment = await withTransaction(pool, async (tx) => {
        const created = await assignmentsRepo.createAssignment(tx, organisationId, {
          controlId,
          assigneeId,
          assignedBy: req.session.userId!,
          dueDate,
        });
        await auditLog.appendAuditEntry(tx, organisationId, {
          userId: req.session.userId!,
          action: 'control_assigned',
          controlId,
        });
        return created;
      });
      log.info(
        { control_id: controlId, user_id: req.session.userId, org_id: organisationId },
        'control_assigned'
      );
      res.status(201).json({ assignment });
    } catch (err) {
      next(err);
    }
  });

  /** Assignee records an evidence note (text only in v1). */
  router.post('/assignments/:id/evidence', requireAuth, async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const id = req.params.id!;
      const { evidenceNote } = req.body ?? {};
      if (!UUID_RE.test(id)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (typeof evidenceNote !== 'string' || !evidenceNote.trim()) {
        res.status(400).json({ error: 'evidenceNote is required' });
        return;
      }
      const assignment = await withTransaction(pool, async (tx) => {
        const updated = await assignmentsRepo.setEvidenceNote(
          tx,
          organisationId,
          id,
          req.session.userId!,
          evidenceNote.trim()
        );
        if (updated) {
          await auditLog.appendAuditEntry(tx, organisationId, {
            userId: req.session.userId!,
            action: 'evidence_added',
            controlId: updated.control_id,
          });
        }
        return updated;
      });
      if (!assignment) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      log.info(
        { control_id: assignment.control_id, user_id: req.session.userId, org_id: organisationId },
        'evidence_added'
      );
      res.json({ assignment });
    } catch (err) {
      next(err);
    }
  });

  /** Assignee marks the assignment ready for review. */
  router.post('/assignments/:id/submit', requireAuth, async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const id = req.params.id!;
      if (!UUID_RE.test(id)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const assignment = await withTransaction(pool, async (tx) => {
        const updated = await assignmentsRepo.submitForReview(
          tx,
          organisationId,
          id,
          req.session.userId!
        );
        if (updated) {
          await controlsRepo.updateControlStatus(
            tx,
            organisationId,
            updated.control_id,
            'in_review'
          );
          await auditLog.appendAuditEntry(tx, organisationId, {
            userId: req.session.userId!,
            action: 'submitted_for_review',
            controlId: updated.control_id,
          });
        }
        return updated;
      });
      if (!assignment) {
        res
          .status(404)
          .json({ error: 'Not found' });
        return;
      }
      log.info(
        { control_id: assignment.control_id, user_id: req.session.userId, org_id: organisationId },
        'submitted_for_review'
      );
      res.json({ assignment });
    } catch (err) {
      next(err);
    }
  });

  /** Manager (or admin) accepts or rejects a submission. */
  router.post('/assignments/:id/review', requireRole('admin', 'manager'), async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const id = req.params.id!;
      const { decision, reason } = req.body ?? {};
      if (!UUID_RE.test(id)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (decision !== 'accept' && decision !== 'reject') {
        res.status(400).json({ error: 'decision must be "accept" or "reject"' });
        return;
      }
      if (decision === 'reject' && (typeof reason !== 'string' || !reason.trim())) {
        res.status(400).json({ error: 'A reason is required when rejecting' });
        return;
      }

      const assignment = await withTransaction(pool, async (tx) => {
        const updated = await assignmentsRepo.reviewAssignment(
          tx,
          organisationId,
          id,
          decision === 'accept' ? 'accepted' : 'rejected',
          decision === 'reject' ? reason.trim() : null
        );
        if (updated) {
          await controlsRepo.updateControlStatus(
            tx,
            organisationId,
            updated.control_id,
            decision === 'accept' ? 'passed' : 'pending'
          );
          await auditLog.appendAuditEntry(tx, organisationId, {
            userId: req.session.userId!,
            action: decision === 'accept' ? 'review_accepted' : 'review_rejected',
            controlId: updated.control_id,
          });
        }
        return updated;
      });
      if (!assignment) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      log.info(
        { control_id: assignment.control_id, user_id: req.session.userId, org_id: organisationId },
        decision === 'accept' ? 'review_accepted' : 'review_rejected'
      );
      res.json({ assignment });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
