import OpenAI from 'openai';

import { logger } from '@/lib/logging';
import {
  openAICircuitBreaker,
  withRetry,
  CircuitOpenError,
  type RetryOptions,
} from '@/lib/ai/openai-resilience';

let openaiInstance: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiInstance) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60_000,  // 60 s per call — OpenAI can be slow under load
      maxRetries: 0,    // We handle retries ourselves via withRetry
    });
  }

  return openaiInstance;
}

/** Default model, overridable per-call or via env var. */
const DEFAULT_MODEL = 'gpt-4o';
const FALLBACK_MODEL = 'gpt-4o-mini';

export async function generateCompletion(
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
    /** Request ID for correlation in logs */
    requestId?: string;
  } = {},
): Promise<string> {
  const model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const requestId = options.requestId;

  const callOpenAI = async (useModel: string) => {
    const openai = getOpenAIClient();
    const start = Date.now();

    const response = await openai.chat.completions.create({
      model: useModel,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens || 4000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    logger.info('OpenAI completion succeeded', {
      requestId,
      model: useModel,
      durationMs: Date.now() - start,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
    });

    return content;
  };

  // Wrap in circuit breaker → retry → call
  try {
    return await openAICircuitBreaker.call(() =>
      withRetry(() => callOpenAI(model), {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10_000,
        jitter: true,
      }),
    );
  } catch (error) {
    // If the circuit is open OR the primary model exhausted all retries,
    // attempt a single call with the cheaper fallback model.
    if (model !== FALLBACK_MODEL) {
      const shouldFallback =
        error instanceof CircuitOpenError ||
        (error instanceof Error && error.message.toLowerCase().includes('timeout'));

      if (shouldFallback) {
        logger.warn('Primary model unavailable, falling back to cheaper model', {
          requestId,
          primaryModel: model,
          fallbackModel: FALLBACK_MODEL,
          reason: error instanceof Error ? error.message : String(error),
        });

        try {
          return await callOpenAI(FALLBACK_MODEL);
        } catch (fallbackError) {
          logger.error('Fallback model also failed', {
            requestId,
            model: FALLBACK_MODEL,
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          });
          // Throw the original error — the caller should see the primary failure.
          throw error;
        }
      }
    }

    throw error;
  }
}
