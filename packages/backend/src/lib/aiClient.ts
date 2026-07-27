import OpenAI from 'openai';
import { Config } from '../config';

/**
 * Thin client boundary around the OpenAI API. The route layer depends only
 * on the AiReviewClient interface, so integration tests inject a fake and
 * never touch the network. Failures are normalised to typed errors the route
 * maps to metadata-only ai_interactions records — the raw provider error
 * never reaches a client or a log content field.
 */

export interface AiCompletion {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface AiReviewClient {
  complete(systemPrompt: string, userMessage: string): Promise<AiCompletion>;
}

export class AiTimeoutError extends Error {
  constructor() {
    super('AI request timed out');
  }
}

export class AiUpstreamRateLimitError extends Error {
  constructor() {
    super('AI provider rate limit reached');
  }
}

export class AiUpstreamError extends Error {}

/**
 * Builds the review client for the configured provider. OpenAI and Groq both
 * speak the OpenAI wire format, so they differ only by key and base URL —
 * one client, one error-mapping path, no provider branching downstream.
 */
export function createAiReviewClient(config: Config): AiReviewClient {
  const client = new OpenAI({
    apiKey: config.aiApiKey ?? '',
    ...(config.aiBaseUrl ? { baseURL: config.aiBaseUrl } : {}),
    timeout: config.aiRequestTimeoutMs,
    maxRetries: 0,
  });

  return {
    async complete(systemPrompt, userMessage) {
      try {
        const completion = await client.chat.completions.create({
          model: config.aiModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          // Both providers honour this; the parser still falls back to prose
          // if a model ignores it.
          response_format: { type: 'json_object' },
        });
        return {
          content: completion.choices[0]?.message?.content ?? '',
          model: completion.model,
          promptTokens: completion.usage?.prompt_tokens ?? 0,
          completionTokens: completion.usage?.completion_tokens ?? 0,
        };
      } catch (err) {
        if (err instanceof OpenAI.APIConnectionTimeoutError) {
          throw new AiTimeoutError();
        }
        if (err instanceof OpenAI.APIError && err.status === 429) {
          throw new AiUpstreamRateLimitError();
        }
        throw new AiUpstreamError(err instanceof Error ? err.message : 'AI provider error');
      }
    },
  };
}

/**
 * Bounds a client call to timeoutMs regardless of the underlying client's
 * own behaviour (defence in depth: the OpenAI client has its own timeout,
 * but an injected or misbehaving client must still be cut off).
 */
export async function completeWithTimeout(
  client: AiReviewClient,
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number
): Promise<AiCompletion> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      client.complete(systemPrompt, userMessage),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AiTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
