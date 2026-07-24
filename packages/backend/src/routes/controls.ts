import { Router } from 'express';
import { Pool } from 'pg';
import { Logger } from '../logger';
import { withTransaction } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import * as controls from '../repositories/controls';
import * as assignments from '../repositories/assignments';
import * as auditLog from '../repositories/auditLog';
import { ControlStatus } from '../repositories/types';

const CONTROL_STATUSES: ControlStatus[] = ['pending', 'in_review', 'passed', 'deferred'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function controlsRouter(pool: Pool, log: Logger): Router {
  const router = Router();

  router.get('/controls', requireAuth, async (req, res, next) => {
    try {
      const rows = await controls.listControls(pool, req.session.organisationId!);
      res.json({ controls: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get('/controls/:id', requireAuth, async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const id = req.params.id!;
      if (!UUID_RE.test(id)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const control = await controls.findControlById(pool, organisationId, id);
      if (!control) {
        // 404 for both "does not exist" and "belongs to another
        // organisation" — cross-tenant existence is never revealed.
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const controlAssignments = await assignments.listAssignmentsByOrganisation(
        pool,
        organisationId
      );
      res.json({
        control,
        assignments: controlAssignments.filter((a) => a.control_id === control.id),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/controls', requireRole('admin'), async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const { name, description } = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const control = await withTransaction(pool, async (tx) => {
        const created = await controls.createControl(tx, organisationId, {
          name: name.trim(),
          description: typeof description === 'string' ? description.trim() : '',
        });
        await auditLog.appendAuditEntry(tx, organisationId, {
          userId: req.session.userId!,
          action: 'control_created',
          controlId: created.id,
        });
        return created;
      });
      log.info(
        { control_id: control.id, user_id: req.session.userId, org_id: organisationId },
        'control_created'
      );
      res.status(201).json({ control });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/controls/:id/status', requireRole('admin'), async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const id = req.params.id!;
      const { status } = req.body ?? {};
      if (!UUID_RE.test(id)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (!CONTROL_STATUSES.includes(status)) {
        res.status(400).json({ error: `status must be one of: ${CONTROL_STATUSES.join(', ')}` });
        return;
      }
      const control = await withTransaction(pool, async (tx) => {
        const updated = await controls.updateControlStatus(tx, organisationId, id, status);
        if (updated) {
          await auditLog.appendAuditEntry(tx, organisationId, {
            userId: req.session.userId!,
            action: `control_status_${status}`,
            controlId: updated.id,
          });
        }
        return updated;
      });
      if (!control) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      log.info(
        { control_id: control.id, user_id: req.session.userId, org_id: organisationId },
        'control_status_changed'
      );
      res.json({ control });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
