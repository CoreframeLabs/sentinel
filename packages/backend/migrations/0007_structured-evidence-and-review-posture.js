/* eslint-disable camelcase */

/**
 * Structured evidence capture and AI review posture.
 *
 * - assignments gains the fields an auditor actually records alongside a
 *   narrative summary: how the control was tested, the period covered, the
 *   sample examined, and where the underlying record is filed. Every column
 *   is nullable so existing rows stay valid and the narrative-only path
 *   keeps working; evidence_note remains the summary.
 * - ai_feature_settings gains review_posture. The value only ever selects a
 *   prompt fragment defined in application code (src/lib/aiReview.ts) — it is
 *   never interpolated into the prompt itself, so a database row cannot
 *   rewrite the reviewer's instructions. The CHECK constraint keeps the
 *   column to the known set even if application validation were bypassed.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE assignments
      ADD COLUMN evidence_method text
        CHECK (evidence_method IN ('inspection', 'observation', 'inquiry', 'reperformance')),
      ADD COLUMN evidence_period_start date,
      ADD COLUMN evidence_period_end   date,
      ADD COLUMN evidence_sample_size  integer CHECK (evidence_sample_size >= 0),
      ADD COLUMN evidence_population   integer CHECK (evidence_population >= 0),
      ADD COLUMN evidence_location     text;

    -- A period must not run backwards; either end may be omitted.
    ALTER TABLE assignments
      ADD CONSTRAINT assignments_evidence_period_ordered
        CHECK (
          evidence_period_start IS NULL
          OR evidence_period_end IS NULL
          OR evidence_period_start <= evidence_period_end
        );

    -- A sample cannot exceed the population it was drawn from.
    ALTER TABLE assignments
      ADD CONSTRAINT assignments_evidence_sample_within_population
        CHECK (
          evidence_sample_size IS NULL
          OR evidence_population IS NULL
          OR evidence_sample_size <= evidence_population
        );

    ALTER TABLE ai_feature_settings
      ADD COLUMN review_posture text NOT NULL DEFAULT 'balanced'
        CHECK (review_posture IN ('balanced', 'strict', 'coaching'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE ai_feature_settings DROP COLUMN review_posture;

    ALTER TABLE assignments
      DROP CONSTRAINT assignments_evidence_sample_within_population,
      DROP CONSTRAINT assignments_evidence_period_ordered,
      DROP COLUMN evidence_location,
      DROP COLUMN evidence_population,
      DROP COLUMN evidence_sample_size,
      DROP COLUMN evidence_period_end,
      DROP COLUMN evidence_period_start,
      DROP COLUMN evidence_method;
  `);
};
