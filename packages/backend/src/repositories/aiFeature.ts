import {
  Queryable,
  AiFeatureSettingsRow,
  AiInteractionRow,
  AiResponseType,
  ReviewPosture,
} from './types';

/**
 * AI feature settings and interaction metadata. The feature flag and both
 * rate limits live here at the data layer: the route may not construct a
 * prompt unless isEnabled() said so, and rate limits are counted from the
 * ai_interactions table — never from process memory — so they survive
 * restarts.
 *
 * ai_interactions is append-only (database trigger, migration 0005) and
 * holds metadata only. There is deliberately no method that reads or writes
 * evidence text, prompts or model responses.
 */

export const AI_DEFAULT_MAX_REQUESTS_PER_USER_PER_DAY = 10;
export const AI_DEFAULT_MAX_REQUESTS_PER_ORG_PER_DAY = 50;
export const AI_DEFAULT_REVIEW_POSTURE: ReviewPosture = 'balanced';

export async function getSettings(
  db: Queryable,
  organisationId: string
): Promise<AiFeatureSettingsRow | null> {
  const result = await db.query<AiFeatureSettingsRow>(
    'SELECT * FROM ai_feature_settings WHERE organisation_id = $1',
    [organisationId]
  );
  return result.rows[0] ?? null;
}

/** Disabled by default: no settings row means the feature is off. */
export async function isEnabled(db: Queryable, organisationId: string): Promise<boolean> {
  const settings = await getSettings(db, organisationId);
  return settings?.enabled ?? false;
}

export async function upsertSettings(
  db: Queryable,
  organisationId: string,
  input: {
    enabled: boolean;
    maxRequestsPerUserPerDay: number;
    maxRequestsPerOrgPerDay: number;
    reviewPosture: ReviewPosture;
    actorUserId: string;
  }
): Promise<AiFeatureSettingsRow> {
  const result = await db.query<AiFeatureSettingsRow>(
    `INSERT INTO ai_feature_settings
       (organisation_id, enabled, max_requests_per_user_per_day, max_requests_per_org_per_day,
        review_posture, enabled_by, enabled_at)
     VALUES ($1, $2, $3, $4, $6,
             CASE WHEN $2 THEN $5::uuid ELSE NULL END,
             CASE WHEN $2 THEN now() ELSE NULL END)
     ON CONFLICT (organisation_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       max_requests_per_user_per_day = EXCLUDED.max_requests_per_user_per_day,
       max_requests_per_org_per_day = EXCLUDED.max_requests_per_org_per_day,
       review_posture = EXCLUDED.review_posture,
       enabled_by = CASE WHEN EXCLUDED.enabled THEN $5::uuid ELSE ai_feature_settings.enabled_by END,
       enabled_at = CASE WHEN EXCLUDED.enabled AND NOT ai_feature_settings.enabled
                         THEN now() ELSE ai_feature_settings.enabled_at END,
       updated_at = now()
     RETURNING *`,
    [
      organisationId,
      input.enabled,
      input.maxRequestsPerUserPerDay,
      input.maxRequestsPerOrgPerDay,
      input.actorUserId,
      input.reviewPosture,
    ]
  );
  return result.rows[0]!;
}

/**
 * Rate-limit counters over a sliding 24-hour window, computed in the
 * database. rate_limited rows are excluded from the count: a denied request
 * consumed no AI capacity, and counting denials would let a polling client
 * lock itself out permanently.
 */
export async function countRecentByOrganisation(
  db: Queryable,
  organisationId: string
): Promise<number> {
  const result = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ai_interactions
     WHERE organisation_id = $1
       AND requested_at > now() - interval '24 hours'
       AND response_type <> 'rate_limited'`,
    [organisationId]
  );
  return Number(result.rows[0]!.n);
}

export async function countRecentByUser(
  db: Queryable,
  organisationId: string,
  userId: string
): Promise<number> {
  const result = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ai_interactions
     WHERE organisation_id = $1
       AND requested_by = $2
       AND requested_at > now() - interval '24 hours'
       AND response_type <> 'rate_limited'`,
    [organisationId, userId]
  );
  return Number(result.rows[0]!.n);
}

export async function insertInteraction(
  db: Queryable,
  organisationId: string,
  input: {
    controlId: string;
    reviewId: string | null;
    requestedBy: string;
    model: string;
    promptTokenCount: number;
    completionTokenCount: number;
    responseType: AiResponseType;
    citationsPresent: boolean;
    errorCode: string | null;
  }
): Promise<AiInteractionRow> {
  const result = await db.query<AiInteractionRow>(
    `INSERT INTO ai_interactions
       (organisation_id, control_id, review_id, requested_by, model,
        prompt_token_count, completion_token_count, response_type, citations_present, error_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      organisationId,
      input.controlId,
      input.reviewId,
      input.requestedBy,
      input.model,
      input.promptTokenCount,
      input.completionTokenCount,
      input.responseType,
      input.citationsPresent,
      input.errorCode,
    ]
  );
  return result.rows[0]!;
}

export async function listInteractions(
  db: Queryable,
  organisationId: string,
  limit = 200
): Promise<AiInteractionRow[]> {
  const result = await db.query<AiInteractionRow>(
    `SELECT * FROM ai_interactions
     WHERE organisation_id = $1
     ORDER BY requested_at DESC, id DESC
     LIMIT $2`,
    [organisationId, limit]
  );
  return result.rows;
}
