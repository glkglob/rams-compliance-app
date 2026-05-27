import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase-server';

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {};
  let healthy = true;

  // --- Supabase DB ---
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.from('profiles').select('id').limit(1);
    checks.database = error ? 'error' : 'ok';
    if (error) {
      console.error('[health] Supabase check failed:', error.message);
      healthy = false;
    }
  } catch (err) {
    checks.database = 'error';
    console.error('[health] Supabase check threw:', err);
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
      console.error('[health] Redis check failed (non-fatal):', err);
      // Intentionally NOT setting healthy = false — see comment above.
    }
  }

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', timestamp: new Date().toISOString(), checks },
    { status: healthy ? 200 : 503 }
  );
}
