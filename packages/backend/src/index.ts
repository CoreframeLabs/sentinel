// Loads a local .env file in development; a no-op when the file is absent
// (production injects real environment variables). Values already present in
// the environment always win — dotenv never overrides.
import 'dotenv/config';
import { loadConfig, ConfigError } from './config';
import { createPool, healthCheck } from './db';
import { logger } from './logger';
import { buildApp } from './app';

/**
 * Fail-closed startup:
 * 1. Validate configuration — a missing variable is named (never its value)
 *    and the process exits with code 1.
 * 2. Prove the database is reachable before binding the port. If it is not,
 *    log the failure class (never the connection string) and exit with
 *    code 1. The server never serves requests without a working database.
 */
async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      logger.fatal({ reason: err.message }, 'config_invalid');
      process.exit(1);
    }
    throw err;
  }

  const pool = createPool(config.databaseUrl);
  try {
    await healthCheck(pool);
  } catch (err) {
    logger.fatal(
      { reason: err instanceof Error ? err.message : 'unknown' },
      'database_unreachable'
    );
    process.exit(1);
  }

  const app = buildApp(config, pool, logger);
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, node_env: config.nodeEnv }, 'server_started');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutdown_started');
    server.close(() => {
      void pool.end().then(() => {
        logger.info({}, 'shutdown_complete');
        process.exit(0);
      });
    });
    // Force-exit if connections refuse to drain.
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal(
    { reason: err instanceof Error ? err.message : 'unknown' },
    'startup_failed'
  );
  process.exit(1);
});
