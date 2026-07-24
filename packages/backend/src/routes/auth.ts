import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Router, RequestHandler } from 'express';
import { Pool } from 'pg';
import { Logger } from '../logger';
import { withTransaction } from '../db';
import { BCRYPT_ROUNDS, hashPassword, verifyPassword } from '../lib/password';
import { safeCompare } from '../lib/safeCompare';
import { parseInvitationToken, hashVerifier } from '../lib/invitationToken';
import { CSRF_COOKIE_NAME } from '../middleware/csrf';
import { SESSION_COOKIE_NAME } from '../lib/session';
import { requireAuth } from '../middleware/auth';
import * as organisations from '../repositories/organisations';
import * as users from '../repositories/users';
import * as invitations from '../repositories/invitations';
import * as auditLog from '../repositories/auditLog';
import { Role, UserRow } from '../repositories/types';

/**
 * Identical response for "email not found" and "wrong password" — prevents
 * user enumeration via the login form.
 */
const LOGIN_FAILED = { error: 'Invalid email or password' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 10;

function publicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    organisationId: user.organisation_id,
    tourCompletedAt: user.tour_completed_at,
  };
}

/** Regenerates the session (prevents fixation) and stores the principal. */
function establishSession(req: Parameters<RequestHandler>[0], user: UserRow): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) {
        reject(err);
        return;
      }
      req.session.userId = user.id;
      req.session.organisationId = user.organisation_id;
      req.session.role = user.role;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

export function authRouter(pool: Pool, log: Logger, loginRateLimiter: RequestHandler): Router {
  const router = Router();

  /** Creates a new organisation with its first admin user. */
  router.post('/auth/register', async (req, res, next) => {
    try {
      const { organisationName, email, password, displayName } = req.body ?? {};
      if (
        typeof organisationName !== 'string' ||
        !organisationName.trim() ||
        typeof email !== 'string' ||
        !EMAIL_RE.test(email) ||
        typeof displayName !== 'string' ||
        !displayName.trim() ||
        typeof password !== 'string' ||
        password.length < MIN_PASSWORD_LENGTH
      ) {
        res.status(400).json({
          error: `organisationName, email, displayName and a password of at least ${MIN_PASSWORD_LENGTH} characters are required`,
        });
        return;
      }

      const existing = await users.findUserByEmail(pool, email);
      if (existing) {
        // Same message as any validation failure at this step; registration
        // is admin-driven so this is acceptable without an enumeration-safe
        // double-blind flow.
        res.status(409).json({ error: 'That email cannot be used' });
        return;
      }

      const passwordHash = await hashPassword(password);
      const user = await withTransaction(pool, async (tx) => {
        const org = await organisations.createOrganisation(tx, organisationName.trim());
        const created = await users.createUser(tx, {
          organisationId: org.id,
          email,
          passwordHash,
          displayName: displayName.trim(),
          role: 'admin',
        });
        await auditLog.appendAuditEntry(tx, org.id, {
          userId: created.id,
          action: 'organisation_created',
          controlId: null,
        });
        return created;
      });

      await establishSession(req, user);
      log.info({ user_id: user.id, org_id: user.organisation_id }, 'user_registered');
      res.status(201).json({ user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/login', loginRateLimiter, async (req, res, next) => {
    try {
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json(LOGIN_FAILED);
        return;
      }

      const user = await users.findUserByEmail(pool, email);
      if (!user) {
        // Burn a bcrypt comparison against a fixed hash so the response time
        // for "unknown email" matches "wrong password".
        await verifyPassword(password, DUMMY_BCRYPT_HASH);
        res.status(401).json(LOGIN_FAILED);
        return;
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        log.info({ user_id: user.id }, 'login_failed');
        res.status(401).json(LOGIN_FAILED);
        return;
      }

      await establishSession(req, user);
      log.info({ user_id: user.id, org_id: user.organisation_id }, 'login_succeeded');
      res.json({ user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  /** Joins an existing organisation using an invitation token. */
  router.post('/auth/accept-invite', async (req, res, next) => {
    try {
      const { token, password, displayName } = req.body ?? {};
      if (
        typeof token !== 'string' ||
        typeof displayName !== 'string' ||
        !displayName.trim() ||
        typeof password !== 'string' ||
        password.length < MIN_PASSWORD_LENGTH
      ) {
        res.status(400).json({ error: 'token, displayName and password are required' });
        return;
      }

      const invalid = () => res.status(400).json({ error: 'Invalid or expired invitation' });

      const parsed = parseInvitationToken(token);
      if (!parsed) {
        invalid();
        return;
      }

      const invitation = await invitations.findInvitationBySelector(pool, parsed.selector);
      // The verifier is the secret half of the token: compare hashes with
      // safeCompare (crypto.timingSafeEqual), never ===, so timing cannot
      // leak how close a guessed token is.
      if (
        !invitation ||
        invitation.used_at !== null ||
        invitation.expires_at.getTime() < Date.now() ||
        !safeCompare(hashVerifier(parsed.verifier), invitation.verifier_hash)
      ) {
        invalid();
        return;
      }

      const existing = await users.findUserByEmail(pool, invitation.email);
      if (existing) {
        invalid();
        return;
      }

      const passwordHash = await hashPassword(password);
      const user = await withTransaction(pool, async (tx) => {
        const created = await users.createUser(tx, {
          organisationId: invitation.organisation_id,
          email: invitation.email,
          passwordHash,
          displayName: displayName.trim(),
          role: invitation.role as Role,
        });
        await invitations.markInvitationUsed(tx, invitation.organisation_id, invitation.id);
        await auditLog.appendAuditEntry(tx, invitation.organisation_id, {
          userId: created.id,
          action: 'user_joined',
          controlId: null,
        });
        return created;
      });

      await establishSession(req, user);
      log.info({ user_id: user.id, org_id: user.organisation_id }, 'invitation_accepted');
      res.status(201).json({ user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/logout', requireAuth, (req, res, next) => {
    const userId = req.session.userId;
    // Destroy the session server-side (removes the row from the session
    // table); clearing the cookie alone would leave the session usable.
    req.session.destroy((err) => {
      if (err) {
        next(err);
        return;
      }
      res.clearCookie(SESSION_COOKIE_NAME);
      res.clearCookie(CSRF_COOKIE_NAME);
      log.info({ user_id: userId }, 'logout');
      res.json({ ok: true });
    });
  });

  router.get('/auth/me', requireAuth, async (req, res, next) => {
    try {
      const user = await users.findUserById(
        pool,
        req.session.organisationId!,
        req.session.userId!
      );
      if (!user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      res.json({ user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * A valid bcrypt hash of random throwaway bytes, computed once at module
 * load and used only to equalise login timing for unknown emails: without a
 * matching user we still burn one bcrypt comparison. Generated rather than
 * hard-coded so it is guaranteed to be a well-formed hash (bcrypt.compare
 * returns instantly on malformed input, which would reopen the timing gap).
 */
const DUMMY_BCRYPT_HASH = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), BCRYPT_ROUNDS);
