/* eslint-disable camelcase */

/**
 * Bounded AI review.
 *
 * - ai_feature_settings: per-organisation feature flag and rate limits.
 *   Disabled by default; one row per organisation, mutable by admins only
 *   (enforced in the route layer).
 * - ai_interactions: metadata-only record of every AI request — who, when,
 *   which control/review, which model, token counts and the validated
 *   outcome. Deliberately no content columns: the evidence text, prompt and
 *   model response are never stored. Append-only via the same trigger guard
 *   as the CSV provenance tables (0004); DELETE only with the operator GUC
 *   sentinel.allow_provenance_delete set by scripts/delete-org.ts.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE ai_feature_settings (
      id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id               uuid NOT NULL UNIQUE REFERENCES organisations(id),
      enabled                       boolean NOT NULL DEFAULT false,
      max_requests_per_user_per_day integer NOT NULL DEFAULT 10,
      max_requests_per_org_per_day  integer NOT NULL DEFAULT 50,
      enabled_by                    uuid REFERENCES users(id),
      enabled_at                    timestamptz,
      created_at                    timestamptz NOT NULL DEFAULT now(),
      updated_at                    timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE ai_interactions (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id        uuid NOT NULL REFERENCES organisations(id),
      control_id             uuid NOT NULL REFERENCES controls(id),
      review_id              uuid REFERENCES assignments(id),
      requested_by           uuid NOT NULL REFERENCES users(id),
      requested_at           timestamptz NOT NULL DEFAULT now(),
      model                  text NOT NULL,
      prompt_token_count     integer NOT NULL DEFAULT 0,
      completion_token_count integer NOT NULL DEFAULT 0,
      response_type          text NOT NULL CHECK (response_type IN
                               ('cited_assessment', 'insufficient_evidence',
                                'rate_limited', 'error')),
      citations_present      boolean NOT NULL DEFAULT false,
      error_code             text,
      created_at             timestamptz NOT NULL DEFAULT now()
    );

    -- Both rate-limit queries are served by these indexes: count per org and
    -- per user over a 24-hour window.
    CREATE INDEX ai_interactions_org_requested_idx
      ON ai_interactions (organisation_id, requested_at DESC);
    CREATE INDEX ai_interactions_user_requested_idx
      ON ai_interactions (requested_by, requested_at DESC);

    CREATE TRIGGER ai_interactions_append_only_trg
      BEFORE UPDATE OR DELETE ON ai_interactions
      FOR EACH ROW EXECUTE FUNCTION provenance_append_only();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE ai_interactions;
    DROP TABLE ai_feature_settings;
  `);
};
