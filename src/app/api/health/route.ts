import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { logger } from '@/lib/logging';

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {};
  let healthy = true;

  // --- Supabase DB (lightweight check) ---
  // NOTE: We no longer fail the entire health check on DB errors.
  // Railway will restart containers aggressively on 5xx/503 from healthchecks.
  // We report 'degraded' but still return 200 so the app isn't killed during transient DB issues or cold starts.
  //
  // Use the service-role admin client here (not the anon client). Health probes
  // from Railway / load balancers do not carry user auth cookies, so an RLS-protected
  // query via createServerSupabase() would fail even when the database is fully reachable.
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('profiles').select('id').limit(1);
    checks.database = error ? 'error' : 'ok';
    if (error) {
      logger.warn('Health: Supabase check failed (app marked degraded but still healthy for Railway)', { error: error.message });
      healthy = false; // internal flag only
    }
  } catch (err) {
    checks.database = 'error';
    logger.warn('Health: Supabase check threw (app marked degraded)', { error: err instanceof Error ? err.message : String(err) });
    healthy = false;
  }

  // --- Upstash Redis (optional — non-fatal) ---
  // Redis is an enhancement for rate limiting that fails open when unavailable.
  // A Redis outage must NOT block Railway's deployment healthcheck — the app can
  // still serve requests; it just won't rate-limit until Redis recovers.
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = Redis.fromEnv();
      await redis.ping();
      checks.redis = 'ok';
    } catch (err) {
      checks.redis = 'error';
      logger.warn('Health: Redis check failed (non-fatal)', { error: err instanceof Error ? err.message : String(err) });
      // Intentionally NOT setting healthy = false — see comment above.
    }
  }

  // Always return 200 for Railway healthcheck.
  // We use the "status" field in the body to indicate real health.
  // Returning 503 too aggressively causes Railway to restart the container on every transient issue.
  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', timestamp: new Date().toISOString(), checks },
    { status: 200 }
  );
}
