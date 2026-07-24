/* eslint-disable camelcase */

/**
 * CSV import with provenance.
 *
 * - controls gains optional category and due_date columns — the import maps
 *   CSV columns onto them; both are nullable so existing rows and the manual
 *   creation flow are unaffected.
 * - csv_import_profiles stores reusable column mappings, organisation-scoped.
 * - csv_import_runs / csv_import_row_results are the provenance record:
 *   append-only at the database layer, mirroring the audit_log trigger
 *   pattern. DELETE is allowed only when the operator-script GUC
 *   sentinel.allow_provenance_delete is set (scripts/delete-org.ts must be
 *   able to remove an organisation's rows to satisfy foreign keys); no
 *   application code path sets it.
 * - csv_import_runs permits exactly one UPDATE shape: profile_id becoming
 *   NULL with every other column unchanged. That is the ON DELETE SET NULL
 *   referential action from deleting a saved profile — the run's provenance
 *   counts stay immutable while profiles remain deletable.
 * - audit_log gains a nullable import_run_id so control_created_by_import
 *   entries reference the run that created them (no FK, matching the
 *   existing convention for audit_log.control_id).
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE controls
      ADD COLUMN category text,
      ADD COLUMN due_date date;

    ALTER TABLE audit_log
      ADD COLUMN import_run_id uuid;

    CREATE TABLE csv_import_profiles (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id uuid NOT NULL REFERENCES organisations(id),
      name            text NOT NULL,
      column_mapping  jsonb NOT NULL,
      created_by      uuid NOT NULL REFERENCES users(id),
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX csv_import_profiles_org_idx ON csv_import_profiles (organisation_id);

    CREATE TABLE csv_import_runs (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id   uuid NOT NULL REFERENCES organisations(id),
      profile_id        uuid REFERENCES csv_import_profiles(id) ON DELETE SET NULL,
      filename_checksum text NOT NULL,
      total_rows        integer NOT NULL,
      accepted_rows     integer NOT NULL,
      rejected_rows     integer NOT NULL,
      created_by        uuid NOT NULL REFERENCES users(id),
      created_at        timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX csv_import_runs_org_created_idx
      ON csv_import_runs (organisation_id, created_at DESC);

    CREATE TABLE csv_import_row_results (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      import_run_id    uuid NOT NULL REFERENCES csv_import_runs(id),
      row_number       integer NOT NULL,
      row_checksum     text NOT NULL,
      status           text NOT NULL CHECK (status IN ('accepted', 'rejected')),
      rejection_reason text,
      control_id       uuid REFERENCES controls(id),
      created_at       timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX csv_import_row_results_run_idx
      ON csv_import_row_results (import_run_id, row_number);

    -- Generic append-only guard: UPDATE always rejected, DELETE only for the
    -- operator deletion script.
    CREATE FUNCTION provenance_append_only() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION '% is append-only: UPDATE is not permitted', TG_TABLE_NAME;
      END IF;
      IF current_setting('sentinel.allow_provenance_delete', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION '% is append-only: DELETE is not permitted', TG_TABLE_NAME;
      END IF;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    -- Runs-specific guard: identical, except for the single permitted UPDATE
    -- shape produced by ON DELETE SET NULL on profile_id (see header comment).
    CREATE FUNCTION csv_import_runs_append_only() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF NEW.profile_id IS NULL AND OLD.profile_id IS NOT NULL
           AND NEW.id = OLD.id
           AND NEW.organisation_id = OLD.organisation_id
           AND NEW.filename_checksum = OLD.filename_checksum
           AND NEW.total_rows = OLD.total_rows
           AND NEW.accepted_rows = OLD.accepted_rows
           AND NEW.rejected_rows = OLD.rejected_rows
           AND NEW.created_by = OLD.created_by
           AND NEW.created_at = OLD.created_at THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'csv_import_runs is append-only: UPDATE is not permitted';
      END IF;
      IF current_setting('sentinel.allow_provenance_delete', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'csv_import_runs is append-only: DELETE is not permitted';
      END IF;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER csv_import_runs_append_only_trg
      BEFORE UPDATE OR DELETE ON csv_import_runs
      FOR EACH ROW EXECUTE FUNCTION csv_import_runs_append_only();

    CREATE TRIGGER csv_import_row_results_append_only_trg
      BEFORE UPDATE OR DELETE ON csv_import_row_results
      FOR EACH ROW EXECUTE FUNCTION provenance_append_only();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE csv_import_row_results;
    DROP TABLE csv_import_runs;
    DROP TABLE csv_import_profiles;
    DROP FUNCTION csv_import_runs_append_only();
    DROP FUNCTION provenance_append_only();
    ALTER TABLE audit_log DROP COLUMN import_run_id;
    ALTER TABLE controls DROP COLUMN category, DROP COLUMN due_date;
  `);
};
