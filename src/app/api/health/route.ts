import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { logger } from '@/lib/logging';

type CheckStatus = 'ok' | 'error';

async function runChecks(): Promise<{
  healthy: boolean;
  checks: Record<string, CheckStatus>;
}> {
  const checks: Record<string, CheckStatus> = {};
  let healthy = true;

  // --- Supabase DB (lightweight check) ---
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.from('profiles').select('id').limit(1);
    checks.database = error ? 'error' : 'ok';
    if (error) {
      logger.warn('Health: Supabase check failed', { error: error.message });
      healthy = false;
    }
  } catch (err) {
    checks.database = 'error';
    logger.warn('Health: Supabase check threw', {
      error: err instanceof Error ? err.message : String(err),
    });
    healthy = false;
  }

  // --- Upstash Redis (optional — non-fatal) ---
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = Redis.fromEnv();
      await redis.ping();
      checks.redis = 'ok';
    } catch (err) {
      checks.redis = 'error';
      logger.warn('Health: Redis check failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { healthy, checks };
}

/**
 * GET /api/health
 *
 * Dual-mode health endpoint:
 *   • Default (no query param) → **liveness**: always returns 200 so Railway
 *     does not aggressively restart the container on transient DB issues.
 *   • `?check=readiness`       → **readiness**: returns 503 when the DB is
 *     unreachable so load-balancers can stop routing traffic.
 *
 * Both modes include the same JSON body with component-level detail.
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('check');
  const { healthy, checks } = await runChecks();

  const status = healthy ? 'ok' : 'degraded';
  const body = { status, timestamp: new Date().toISOString(), checks };

  if (mode === 'readiness' && !healthy) {
    return NextResponse.json(body, { status: 503 });
  }

  return NextResponse.json(body, { status: 200 });
}
