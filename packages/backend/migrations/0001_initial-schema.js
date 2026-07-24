/* eslint-disable camelcase */

/**
 * Initial schema.
 *
 * Multi-tenancy is enforced at the data layer: every organisation-scoped
 * table carries a NOT NULL organisation_id with a foreign key. Application
 * repositories must include organisation_id in every query; the schema makes
 * it impossible to insert unscoped rows.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE organisations (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name       text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE users (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id uuid NOT NULL REFERENCES organisations(id),
      email           text NOT NULL,
      password_hash   text NOT NULL,
      display_name    text NOT NULL,
      role            text NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
      created_at      timestamptz NOT NULL DEFAULT now()
    );

    -- Emails are globally unique (login is by email alone) and matched
    -- case-insensitively.
    CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));
    CREATE INDEX users_organisation_id_idx ON users (organisation_id);

    CREATE TABLE controls (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id uuid NOT NULL REFERENCES organisations(id),
      name            text NOT NULL,
      description     text NOT NULL DEFAULT '',
      status          text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'in_review', 'passed', 'deferred')),
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX controls_org_idx ON controls (organisation_id);
    CREATE INDEX controls_org_status_idx ON controls (organisation_id, status);

    CREATE TABLE assignments (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id  uuid NOT NULL REFERENCES organisations(id),
      control_id       uuid NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
      assignee_id      uuid NOT NULL REFERENCES users(id),
      assigned_by      uuid NOT NULL REFERENCES users(id),
      due_date         date NOT NULL,
      evidence_note    text,
      state            text NOT NULL DEFAULT 'assigned'
                         CHECK (state IN ('assigned', 'ready_for_review', 'accepted', 'rejected')),
      rejection_reason text,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX assignments_org_idx ON assignments (organisation_id);
    CREATE INDEX assignments_org_assignee_idx ON assignments (organisation_id, assignee_id);
    CREATE INDEX assignments_control_idx ON assignments (control_id);

    -- Invitation tokens use a selector/verifier split: the selector is looked
    -- up by index, the verifier is compared with a constant-time comparison in
    -- application code. Only a SHA-256 hash of the verifier is stored, so a
    -- database leak does not leak usable invitation tokens.
    CREATE TABLE invitations (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id uuid NOT NULL REFERENCES organisations(id),
      email           text NOT NULL,
      role            text NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
      selector        text NOT NULL UNIQUE,
      verifier_hash   text NOT NULL,
      expires_at      timestamptz NOT NULL,
      used_at         timestamptz,
      created_by      uuid NOT NULL REFERENCES users(id),
      created_at      timestamptz NOT NULL DEFAULT now()
    );

    -- Audit log stores identifiers and action names only — never content
    -- fields such as control names or user display names.
    CREATE TABLE audit_log (
      id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      organisation_id uuid NOT NULL REFERENCES organisations(id),
      user_id         uuid REFERENCES users(id),
      action          text NOT NULL,
      control_id      uuid,
      created_at      timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX audit_log_org_created_idx ON audit_log (organisation_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE audit_log;
    DROP TABLE invitations;
    DROP TABLE assignments;
    DROP TABLE controls;
    DROP TABLE users;
    DROP TABLE organisations;
  `);
};
