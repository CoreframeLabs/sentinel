export interface Config {
  databaseUrl: string;
  sessionSecret: string;
  nodeEnv: 'development' | 'production' | 'test';
  frontendUrl: string;
  port: number;
  /** Deployment-level AI switch. Even when true, each organisation must be
   * enabled individually by an admin (ai_feature_settings). */
  aiFeatureEnabled: boolean;
  /** Which upstream serves AI review. Both speak the OpenAI wire format, so
   * they share one client — only the key and base URL differ. */
  aiProvider: AiProvider;
  /** Key for the selected provider; null when AI is disabled. */
  aiApiKey: string | null;
  aiModel: string;
  aiBaseUrl: string | null;
  aiRequestTimeoutMs: number;
  /** Demo deployment: the frontend shows a role-aware "you are X, try this"
   * scenario card. Off by default so nothing demo-only reaches a real
   * customer deployment. */
  demoMode: boolean;
}

export class ConfigError extends Error {}

const MIN_SESSION_SECRET_LENGTH = 32;

export type AiProvider = 'openai' | 'groq';

const AI_PROVIDERS: AiProvider[] = ['openai', 'groq'];

/** Per-provider defaults. Groq is wire-compatible with the OpenAI SDK, so it
 * needs only its own base URL. */
const AI_PROVIDER_DEFAULTS: Record<AiProvider, { baseUrl: string | null; model: string; keyVar: string }> = {
  openai: { baseUrl: null, model: 'gpt-4o-mini', keyVar: 'OPENAI_API_KEY' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyVar: 'GROQ_API_KEY' },
};

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

  // Defaults to openai so an existing deployment configured with
  // OPENAI_API_KEY keeps booting after an upgrade; set AI_PROVIDER=groq to
  // switch.
  const aiProviderRaw = env.AI_PROVIDER?.trim() || 'openai';
  if (!AI_PROVIDERS.includes(aiProviderRaw as AiProvider)) {
    throw new ConfigError(
      `AI_PROVIDER must be one of: ${AI_PROVIDERS.join(', ')} (got "${aiProviderRaw}")`
    );
  }
  const aiProvider = aiProviderRaw as AiProvider;
  const providerDefaults = AI_PROVIDER_DEFAULTS[aiProvider];

  // Fail closed at startup, not on first request: an AI-enabled deployment
  // without a key for the *selected* provider must never boot.
  const aiApiKey =
    (aiProvider === 'groq' ? env.GROQ_API_KEY?.trim() : env.OPENAI_API_KEY?.trim()) || null;
  if (aiFeatureEnabled && !aiApiKey) missing.push(providerDefaults.keyVar);

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

  const demoModeRaw = env.DEMO_MODE ?? 'false';
  if (demoModeRaw !== 'true' && demoModeRaw !== 'false') {
    throw new ConfigError(`DEMO_MODE must be "true" or "false" (got "${demoModeRaw}")`);
  }

  return {
    databaseUrl: databaseUrl!,
    sessionSecret: sessionSecret!,
    nodeEnv,
    frontendUrl: env.FRONTEND_URL ?? 'http://localhost:5173',
    port,
    aiFeatureEnabled,
    aiProvider,
    aiApiKey,
    // AI_MODEL is provider-neutral; OPENAI_MODEL is still honoured so an
    // existing configuration keeps working unchanged.
    aiModel: env.AI_MODEL?.trim() || env.OPENAI_MODEL?.trim() || providerDefaults.model,
    aiBaseUrl: env.AI_BASE_URL?.trim() || providerDefaults.baseUrl,
    aiRequestTimeoutMs,
    demoMode: demoModeRaw === 'true',
  };
}
