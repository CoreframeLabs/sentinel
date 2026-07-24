export interface Config {
  databaseUrl: string;
  sessionSecret: string;
  nodeEnv: 'development' | 'production' | 'test';
  frontendUrl: string;
  port: number;
  /** Deployment-level AI switch. Even when true, each organisation must be
   * enabled individually by an admin (ai_feature_settings). */
  aiFeatureEnabled: boolean;
  openaiApiKey: string | null;
  openaiModel: string;
  aiRequestTimeoutMs: number;
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

  const aiFeatureEnabledRaw = env.AI_FEATURE_ENABLED ?? 'false';
  if (aiFeatureEnabledRaw !== 'true' && aiFeatureEnabledRaw !== 'false') {
    throw new ConfigError(`AI_FEATURE_ENABLED must be "true" or "false" (got "${aiFeatureEnabledRaw}")`);
  }
  const aiFeatureEnabled = aiFeatureEnabledRaw === 'true';

  // Fail closed at startup, not on first request: an AI-enabled deployment
  // without a key must never boot.
  const openaiApiKey = env.OPENAI_API_KEY?.trim() || null;
  if (aiFeatureEnabled && !openaiApiKey) missing.push('OPENAI_API_KEY');

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

  const aiRequestTimeoutMs = env.AI_REQUEST_TIMEOUT_MS ? Number(env.AI_REQUEST_TIMEOUT_MS) : 30000;
  if (!Number.isInteger(aiRequestTimeoutMs) || aiRequestTimeoutMs <= 0) {
    throw new ConfigError('AI_REQUEST_TIMEOUT_MS must be a positive integer (milliseconds)');
  }

  return {
    databaseUrl: databaseUrl!,
    sessionSecret: sessionSecret!,
    nodeEnv,
    frontendUrl: env.FRONTEND_URL ?? 'http://localhost:5173',
    port,
    aiFeatureEnabled,
    openaiApiKey,
    openaiModel: env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    aiRequestTimeoutMs,
  };
}
