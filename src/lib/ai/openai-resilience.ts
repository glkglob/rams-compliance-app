/**
 * Resilience utilities for the OpenAI client.
 * Includes retry with exponential backoff + jitter, and a simple circuit breaker.
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
}

export class CircuitOpenError extends Error {
  constructor(message = 'OpenAI circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly resetTimeoutMs: number = 60_000 // 1 minute
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new CircuitOpenError();
      }
    }

    try {
      const result = await fn();

      // Success — reset on half-open or after success in closed
      if (this.state === 'HALF_OPEN') {
        this.reset();
      } else {
        this.failures = 0;
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  private reset() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  getState() {
    return this.state;
  }
}

// Global circuit breaker instance for OpenAI calls
export const openAICircuitBreaker = new CircuitBreaker(5, 60_000);

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
  }

  // If it's an object with status (from OpenAI SDK error shape)
  const anyError = error as any;
  if (anyError?.status) {
    const status = anyError.status;
    return status === 429 || (status >= 500 && status < 600);
  }

  return false;
}

/**
 * Retry wrapper with exponential backoff + jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
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

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);

      // Add jitter (full jitter strategy)
      const jitterDelay = jitter ? Math.random() * delay : delay;

      await new Promise((resolve) => setTimeout(resolve, jitterDelay));
    }
  }

  throw lastError;
}
