/* eslint-disable camelcase */

/**
 * Guided tour state. One nullable timestamp per user: NULL means the user
 * has never completed (or skipped) the in-app tour, so the frontend
 * auto-starts it on their first login. Stored server-side rather than in
 * localStorage so "first time" is per user, not per browser, and survives
 * devices and restarts — consistent with the no-in-memory-state rule.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN tour_completed_at timestamptz;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users DROP COLUMN tour_completed_at;
  `);
};
