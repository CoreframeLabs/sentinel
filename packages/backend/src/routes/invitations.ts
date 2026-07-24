import { Router } from 'express';
import { Pool } from 'pg';
import { Logger } from '../logger';
import { requireRole } from '../middleware/auth';
import { generateInvitationToken } from '../lib/invitationToken';
import * as invitationsRepo from '../repositories/invitations';
import { Role } from '../repositories/types';

const INVITE_ROLES: Role[] = ['admin', 'manager', 'employee'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function invitationsRouter(pool: Pool, log: Logger): Router {
  const router = Router();

  router.get('/invitations', requireRole('admin'), async (req, res, next) => {
    try {
      const rows = await invitationsRepo.listInvitations(pool, req.session.organisationId!);
      // The verifier hash never leaves the server; the full token is shown
      // exactly once, at creation time.
      res.json({
        invitations: rows.map((row) => ({
          id: row.id,
          email: row.email,
          role: row.role,
          expiresAt: row.expires_at,
          usedAt: row.used_at,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/invitations', requireRole('admin'), async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const { email, role } = req.body ?? {};
      if (typeof email !== 'string' || !EMAIL_RE.test(email) || !INVITE_ROLES.includes(role)) {
        res.status(400).json({ error: 'A valid email and role are required' });
        return;
      }

      const { token, selector, verifierHash } = generateInvitationToken();
      const invitation = await invitationsRepo.createInvitation(pool, organisationId, {
        email,
        role,
        selector,
        verifierHash,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        createdBy: req.session.userId!,
      });

      log.info({ user_id: req.session.userId, org_id: organisationId }, 'invitation_created');
      res.status(201).json({
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expires_at,
        },
        // Returned once; only the verifier's hash is stored.
        token,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
