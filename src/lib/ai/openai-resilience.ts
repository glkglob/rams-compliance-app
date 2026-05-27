/**
 * Resilience utilities for the OpenAI client.
 * Includes retry with exponential backoff + jitter, and a circuit breaker
 * that persists state in Upstash Redis (falls back to in-memory for local dev).
 */

import { logger } from '@/lib/logging';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  /** Optional fallback model when main model fails after exhausting retries */
  fallbackModel?: string;
}

export class CircuitOpenError extends Error {
  constructor(message = 'OpenAI circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// ---------------------------------------------------------------------------
// Circuit breaker state — stored in Redis or in-memory
// ---------------------------------------------------------------------------

interface CircuitState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

const REDIS_KEY = 'rams:circuit:openai';
const DEFAULT_STATE: CircuitState = { failures: 0, lastFailureTime: 0, state: 'CLOSED' };

/** In-memory fallback used when Redis is not configured. */
let memoryState: CircuitState = { ...DEFAULT_STATE };

async function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  try {
    const { Redis } = await import('@upstash/redis');
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

async function loadState(): Promise<CircuitState> {
  const redis = await getRedis();
  if (!redis) return memoryState;

  try {
    const raw = await redis.get<CircuitState>(REDIS_KEY);
    return raw ?? { ...DEFAULT_STATE };
  } catch (err) {
    logger.warn('Circuit breaker: failed to read Redis state, using in-memory fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return memoryState;
  }
}

async function saveState(state: CircuitState): Promise<void> {
  // Always keep the in-memory copy in sync (used as fallback).
  memoryState = state;

  const redis = await getRedis();
  if (!redis) return;

  try {
    // TTL: reset timeout × 3 — auto-cleanup if the breaker goes stale.
    await redis.set(REDIS_KEY, state, { ex: 300 });
  } catch (err) {
    logger.warn('Circuit breaker: failed to write Redis state', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

export class CircuitBreaker {
  constructor(
    private readonly failureThreshold: number = 5,
    private readonly resetTimeoutMs: number = 60_000, // 1 minute
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    const state = await loadState();

    if (state.state === 'OPEN') {
      if (Date.now() - state.lastFailureTime > this.resetTimeoutMs) {
        state.state = 'HALF_OPEN';
        await saveState(state);
        logger.info('Circuit breaker transitioning to HALF_OPEN');
      } else {
        throw new CircuitOpenError();
      }
    }

    try {
      const result = await fn();

      // Success — reset on half-open, clear failure count on closed.
      if (state.state === 'HALF_OPEN') {
        await saveState({ ...DEFAULT_STATE });
        logger.info('Circuit breaker reset to CLOSED after successful half-open probe');
      } else if (state.failures > 0) {
        await saveState({ ...state, failures: 0 });
      }

      return result;
    } catch (error) {
      await this.recordFailure(state);
      throw error;
    }
  }

  private async recordFailure(state: CircuitState) {
    const newFailures = state.failures + 1;
    const shouldOpen = state.state === 'HALF_OPEN' || newFailures >= this.failureThreshold;

    const newState: CircuitState = {
      failures: newFailures,
      lastFailureTime: Date.now(),
      state: shouldOpen ? 'OPEN' : state.state,
    };

    await saveState(newState);

    if (shouldOpen) {
      logger.error('Circuit breaker OPENED — OpenAI calls will be rejected', {
        failures: newFailures,
        resetAfterMs: this.resetTimeoutMs,
      });
    }
  }

  async getState(): Promise<CircuitState['state']> {
    const s = await loadState();
    return s.state;
  }
}

// Global circuit breaker instance for OpenAI calls
export const openAICircuitBreaker = new CircuitBreaker(5, 60_000);

// ---------------------------------------------------------------------------
// Retry helpers
// ---------------------------------------------------------------------------

/**
 * Determines if an error from OpenAI (or network) is worth retrying.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network / timeout errors
    if (message.includes('timeout') || message.includes('network') || message.includes('fetch failed')) {
      return true;
    }

    // OpenAI specific retryable status codes
    if (message.includes('429') || message.includes('rate limit')) return true;
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return true;
    }

    // Connection reset / socket hang-up
    if (message.includes('econnreset') || message.includes('socket hang up')) {
      return true;
    }
  }

  // If it's an object with status (from OpenAI SDK error shape)
  const anyError = error as Record<string, unknown>;
  if (typeof anyError?.status === 'number') {
    const status = anyError.status as number;
    return status === 429 || (status >= 500 && status < 600);
  }

  return false;
}

/**
 * Retry wrapper with exponential backoff + jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    jitter = true,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !isRetryableError(error)) {
        throw error;
      }

      // Exponential backoff with decorrelated jitter
      const expDelay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const delay = jitter ? Math.random() * expDelay : expDelay;

      logger.warn('OpenAI call failed, retrying', {
        attempt,
        maxAttempts,
        delayMs: Math.round(delay),
        error: error instanceof Error ? error.message : String(error),
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
