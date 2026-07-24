/* eslint-disable camelcase */

/**
 * Session table for connect-pg-simple. Sessions live in PostgreSQL so they
 * survive process restarts and redeploys; in-memory session storage is
 * explicitly not used.
 *
 * Table shape matches connect-pg-simple's expected schema.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE "session" (
      "sid"    varchar NOT NULL COLLATE "default",
      "sess"   json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    );

    CREATE INDEX "IDX_session_expire" ON "session" ("expire");
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE "session";`);
};
