import { Router } from 'express';
import { Pool } from 'pg';
import { Config } from '../config';
import { Logger } from '../logger';
import { withTransaction } from '../db';
import { requireRole } from '../middleware/auth';
import * as controlsRepo from '../repositories/controls';
import * as assignmentsRepo from '../repositories/assignments';
import * as aiFeature from '../repositories/aiFeature';
import * as auditLog from '../repositories/auditLog';
import { AiResponseType, ReviewPosture } from '../repositories/types';
import {
  AiReviewClient,
  AiTimeoutError,
  AiUpstreamRateLimitError,
  completeWithTimeout,
} from '../lib/aiClient';
import {
  INSUFFICIENT_EVIDENCE_MESSAGE,
  REVIEW_POSTURES,
  buildSystemPrompt,
  buildUserMessage,
  classifyResponse,
} from '../lib/aiReview';
import { composeEvidenceDocument, evidenceFromAssignment } from '../lib/evidence';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DAILY_LIMIT = 10000;

/**
 * Bounded AI review endpoints.
 *
 * Trust boundary, in order, all enforced against the database:
 * 1. The org-level feature flag is read via the repository — disabled (or
 *    absent) means no prompt is ever constructed.
 * 2. The evidence is fetched using the session's organisation ID and the
 *    control ID. The request body is never a source of evidence text, so a
 *    manipulated payload cannot inject content into the prompt.
 * 3. Rate limits are counted from ai_interactions rows, so they survive
 *    restarts.
 * 4. The model response is validated (citations must quote the evidence
 *    verbatim) before anything is returned; the raw response is never stored
 *    and never logged.
 */
export function aiReviewRouter(
  config: Config,
  pool: Pool,
  log: Logger,
  aiClient: AiReviewClient | null
): Router {
  const router = Router();

  router.post('/controls/:id/ai-review', requireRole('manager'), async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const userId = req.session.userId!;
      const controlId = req.params.id!;

      if (!config.aiFeatureEnabled || !aiClient) {
        res.status(503).json({ error: 'AI review is not available in this deployment' });
        return;
      }
      if (!UUID_RE.test(controlId)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      // Feature flag checked at the data layer before any prompt exists.
      if (!(await aiFeature.isEnabled(pool, organisationId))) {
        res.status(403).json({ error: 'AI review is not enabled for this organisation.' });
        return;
      }

      const control = await controlsRepo.findControlById(pool, organisationId, controlId);
      const review = control
        ? await assignmentsRepo.findLatestEvidenceForControl(pool, organisationId, controlId)
        : null;
      const evidence = review ? evidenceFromAssignment(review) : null;
      if (!control || !review || !evidence) {
        // Covers: control missing, control in another organisation, and no
        // submitted evidence — all indistinguishable to the caller.
        res.status(404).json({ error: 'Not found' });
        return;
      }

      // The one text the model sees and the one the reviewer sees highlighted
      // are the same string, so a citation can never be validated against
      // text the user was not shown.
      const evidenceDocument = composeEvidenceDocument(evidence);

      const recordInteraction = (
        responseType: AiResponseType,
        fields: {
          model?: string;
          promptTokenCount?: number;
          completionTokenCount?: number;
          citationsPresent?: boolean;
          errorCode?: string | null;
        } = {}
      ) =>
        aiFeature.insertInteraction(pool, organisationId, {
          controlId,
          reviewId: review.id,
          requestedBy: userId,
          model: fields.model ?? config.aiModel,
          promptTokenCount: fields.promptTokenCount ?? 0,
          completionTokenCount: fields.completionTokenCount ?? 0,
          responseType,
          citationsPresent: fields.citationsPresent ?? false,
          errorCode: fields.errorCode ?? null,
        });

      const settings = await aiFeature.getSettings(pool, organisationId);
      const userLimit =
        settings?.max_requests_per_user_per_day ?? aiFeature.AI_DEFAULT_MAX_REQUESTS_PER_USER_PER_DAY;
      const orgLimit =
        settings?.max_requests_per_org_per_day ?? aiFeature.AI_DEFAULT_MAX_REQUESTS_PER_ORG_PER_DAY;
      const [userCount, orgCount] = await Promise.all([
        aiFeature.countRecentByUser(pool, organisationId, userId),
        aiFeature.countRecentByOrganisation(pool, organisationId),
      ]);
      if (userCount >= userLimit || orgCount >= orgLimit) {
        await recordInteraction('rate_limited');
        log.warn(
          { org_id: organisationId, user_id: userId, control_id: controlId },
          'ai_review_rate_limited'
        );
        res.status(429).json({ error: 'AI review rate limit reached. Please try again later.' });
        return;
      }

      log.info(
        { org_id: organisationId, user_id: userId, control_id: controlId },
        'ai_review_requested'
      );

      let completion;
      try {
        completion = await completeWithTimeout(
          aiClient,
          buildSystemPrompt(settings?.review_posture),
          buildUserMessage(evidenceDocument),
          config.aiRequestTimeoutMs
        );
      } catch (err) {
        const errorCode =
          err instanceof AiTimeoutError
            ? 'timeout'
            : err instanceof AiUpstreamRateLimitError
              ? 'upstream_rate_limited'
              : 'upstream_error';
        await recordInteraction('error', { errorCode });
        log.warn(
          {
            org_id: organisationId,
            user_id: userId,
            control_id: controlId,
            error_code: errorCode,
          },
          'ai_review_error'
        );
        res.status(503).json({ error: 'AI review is temporarily unavailable. Please try again later.' });
        return;
      }

      // Application-layer validation: the model is not trusted to have cited
      // anything. Only the validated outcome and token metadata are stored —
      // never the verdict, the findings or the evidence, all of which are
      // content.
      const classified = classifyResponse(evidenceDocument, completion.content);
      await withTransaction(pool, async (tx) => {
        await aiFeature.insertInteraction(tx, organisationId, {
          controlId,
          reviewId: review.id,
          requestedBy: userId,
          model: completion.model,
          promptTokenCount: completion.promptTokens,
          completionTokenCount: completion.completionTokens,
          responseType: classified.type,
          citationsPresent: classified.citationsPresent,
          errorCode: null,
        });
        await auditLog.appendAuditEntry(tx, organisationId, {
          userId,
          action: 'ai_review_completed',
          controlId,
        });
      });
      log.info(
        {
          org_id: organisationId,
          user_id: userId,
          control_id: controlId,
          response_type: classified.type,
        },
        'ai_review_completed'
      );

      res.json({
        result:
          classified.type === 'cited_assessment'
            ? {
                type: 'cited_assessment',
                verdict: classified.verdict,
                findings: classified.findings,
                gaps: classified.gaps,
                citations: classified.citations,
                // Returned so the reviewer sees the citations highlighted in
                // the exact text that was assessed. Derived from evidence the
                // caller can already read, and never persisted.
                evidenceText: evidenceDocument,
              }
            : { type: 'insufficient_evidence', message: INSUFFICIENT_EVIDENCE_MESSAGE },
      });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------- Admin: settings and interaction history ---------------- */

  router.get('/admin/ai-settings', requireRole('admin'), async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const settings = await aiFeature.getSettings(pool, organisationId);
      res.json({
        settings: {
          enabled: settings?.enabled ?? false,
          maxRequestsPerUserPerDay:
            settings?.max_requests_per_user_per_day ??
            aiFeature.AI_DEFAULT_MAX_REQUESTS_PER_USER_PER_DAY,
          maxRequestsPerOrgPerDay:
            settings?.max_requests_per_org_per_day ??
            aiFeature.AI_DEFAULT_MAX_REQUESTS_PER_ORG_PER_DAY,
          reviewPosture: settings?.review_posture ?? aiFeature.AI_DEFAULT_REVIEW_POSTURE,
        },
        deploymentEnabled: config.aiFeatureEnabled,
      });
    } catch (err) {
      next(err);
    }
  });

  router.put('/admin/ai-settings', requireRole('admin'), async (req, res, next) => {
    try {
      const organisationId = req.session.organisationId!;
      const userId = req.session.userId!;
      const { enabled, maxRequestsPerUserPerDay, maxRequestsPerOrgPerDay, reviewPosture } =
        req.body ?? {};
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled must be a boolean' });
        return;
      }
      // Validated against the enum before it can reach the prompt builder:
      // the posture only ever selects a fragment defined in code, so no
      // client value is ever interpolated into the system prompt.
      const posture: ReviewPosture =
        reviewPosture === undefined || reviewPosture === null
          ? aiFeature.AI_DEFAULT_REVIEW_POSTURE
          : (reviewPosture as ReviewPosture);
      if (!REVIEW_POSTURES.includes(posture)) {
        res.status(400).json({ error: `reviewPosture must be one of: ${REVIEW_POSTURES.join(', ')}` });
        return;
      }
      const limits = { maxRequestsPerUserPerDay, maxRequestsPerOrgPerDay };
      for (const [field, value] of Object.entries(limits)) {
        if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_DAILY_LIMIT) {
          res.status(400).json({ error: `${field} must be an integer between 1 and ${MAX_DAILY_LIMIT}` });
          return;
        }
      }
      const settings = await withTransaction(pool, async (tx) => {
        const previous = await aiFeature.getSettings(tx, organisationId);
        const updated = await aiFeature.upsertSettings(tx, organisationId, {
          enabled,
          maxRequestsPerUserPerDay: maxRequestsPerUserPerDay as number,
          maxRequestsPerOrgPerDay: maxRequestsPerOrgPerDay as number,
          reviewPosture: posture,
          actorUserId: userId,
        });
        if ((previous?.enabled ?? false) !== enabled) {
          await auditLog.appendAuditEntry(tx, organisationId, {
            userId,
            action: enabled ? 'ai_feature_enabled' : 'ai_feature_disabled',
            controlId: null,
          });
        }
        return updated;
      });
      log.info(
        { org_id: organisationId, user_id: userId },
        enabled ? 'ai_feature_enabled' : 'ai_feature_disabled'
      );
      res.json({
        settings: {
          enabled: settings.enabled,
          maxRequestsPerUserPerDay: settings.max_requests_per_user_per_day,
          maxRequestsPerOrgPerDay: settings.max_requests_per_org_per_day,
          reviewPosture: settings.review_posture,
        },
        deploymentEnabled: config.aiFeatureEnabled,
      });
    } catch (err) {
      next(err);
    }
  });

  /** Metadata only: response types, token counts, IDs. Content never existed
   * in the table to begin with. */
  router.get('/admin/ai-interactions', requireRole('admin'), async (req, res, next) => {
    try {
      const interactions = await aiFeature.listInteractions(pool, req.session.organisationId!);
      res.json({ interactions });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
