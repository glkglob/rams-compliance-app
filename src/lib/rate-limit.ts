import { NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Lazily initialised — avoids build-time errors when env vars aren't present yet.
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = Redis.fromEnv();
  }
  return redis;
}

// One Ratelimit instance per logical endpoint, created on first use.
const limiters = new Map<string, Ratelimit>();

function getLimiter(prefix: string, requests: number, window: string): Ratelimit {
  const key = `${prefix}:${requests}:${window}`;
  if (!limiters.has(key)) {
    limiters.set(
      key,
      new Ratelimit({
        redis: getRedis(),
        limiter: Ratelimit.slidingWindow(requests, window as Parameters<typeof Ratelimit.slidingWindow>[1]),
        prefix: `rams:rl:${prefix}`,
        analytics: false,
      })
    );
  }
  return limiters.get(key)!;
}

// Configurable per-endpoint limits (override via env vars on Railway).
const LIMITS = {
  review: {
    requests: parseInt(process.env.RATE_LIMIT_REVIEW ?? '10'),
    window: '1 h',
  },
  'generate-email': {
    requests: parseInt(process.env.RATE_LIMIT_EMAIL ?? '20'),
    window: '1 h',
  },
  'requirements-extract': {
    requests: parseInt(process.env.RATE_LIMIT_REQUIREMENTS ?? '5'),
    window: '1 h',
  },
} as const;

export type RateLimitEndpoint = keyof typeof LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number; // Unix ms
}

/**
 * Check whether `userId` has exceeded the rate limit for `endpoint`.
 * Fails open (allows the request) if Upstash is not configured, so the app
 * works in development without Redis credentials.
 */
export async function checkRateLimit(
  userId: string,
  endpoint: RateLimitEndpoint
): Promise<RateLimitResult> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn('[rate-limit] Upstash not configured — skipping rate limit check');
    const { requests } = LIMITS[endpoint];
    return { allowed: true, limit: requests, remaining: requests, resetMs: 0 };
  }

  const { requests, window } = LIMITS[endpoint];
  const limiter = getLimiter(endpoint, requests, window);
  const { success, limit, remaining, reset } = await limiter.limit(userId);

  if (!success) {
    console.warn(
      `[rate-limit] 429 user=${userId} endpoint=${endpoint} reset=${new Date(reset).toISOString()}`
    );
  }

  return { allowed: success, limit, remaining, resetMs: reset };
}

/** Build a standard 429 response with Retry-After and X-RateLimit-* headers. */
export function rateLimitExceeded(resetMs: number): NextResponse {
  const retryAfterSecs = Math.max(0, Math.ceil((resetMs - Date.now()) / 1000));
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.', retryAfterSeconds: retryAfterSecs },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSecs),
        'X-RateLimit-Reset': String(Math.ceil(resetMs / 1000)),
      },
    }
  );
}
