export interface Config {
  databaseUrl: string;
  sessionSecret: string;
  nodeEnv: 'development' | 'production' | 'test';
  frontendUrl: string;
  port: number;
}

export class ConfigError extends Error {}

const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * Loads and validates configuration from environment variables.
 *
 * Fail-closed: throws ConfigError naming the offending variable (never its
 * value). The caller is expected to log the message and exit(1). There are
 * deliberately no fallback values for secrets.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing: string[] = [];

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) missing.push('DATABASE_URL');

  const sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret) missing.push('SESSION_SECRET');

  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'production' && nodeEnv !== 'test') {
    throw new ConfigError(`NODE_ENV must be development, production or test (got "${nodeEnv}")`);
  }

  if (nodeEnv === 'production' && !env.FRONTEND_URL) missing.push('FRONTEND_URL');

  if (missing.length > 0) {
    throw new ConfigError(`Missing required environment variable(s): ${missing.join(', ')}`);
  }

  if (sessionSecret!.length < MIN_SESSION_SECRET_LENGTH) {
    // Report the constraint, never the value.
    throw new ConfigError(
      `SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters`
    );
  }

  const port = env.PORT ? Number(env.PORT) : 3000;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new ConfigError('PORT must be a valid TCP port number');
  }

  return {
    databaseUrl: databaseUrl!,
    sessionSecret: sessionSecret!,
    nodeEnv,
    frontendUrl: env.FRONTEND_URL ?? 'http://localhost:5173',
    port,
  };
}
