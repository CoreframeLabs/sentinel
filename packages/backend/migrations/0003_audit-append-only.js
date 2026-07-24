/* eslint-disable camelcase */

/**
 * Enforce append-only semantics on audit_log at the database layer.
 *
 * UPDATE is always rejected. DELETE is rejected unless the current session
 * has explicitly set the sentinel.allow_audit_delete GUC — this escape hatch
 * exists solely for the operator-run organisation deletion script
 * (scripts/delete-org.ts), which must be able to remove an organisation's
 * rows to satisfy the foreign key on organisations. No application code path
 * sets this flag.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE FUNCTION audit_log_append_only() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'audit_log is append-only: UPDATE is not permitted';
      END IF;
      IF TG_OP = 'DELETE' THEN
        IF current_setting('sentinel.allow_audit_delete', true) IS DISTINCT FROM 'on' THEN
          RAISE EXCEPTION 'audit_log is append-only: DELETE is not permitted';
        END IF;
        RETURN OLD;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER audit_log_append_only_trg
      BEFORE UPDATE OR DELETE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER audit_log_append_only_trg ON audit_log;
    DROP FUNCTION audit_log_append_only();
  `);
};
