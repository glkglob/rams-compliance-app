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

  // --- Upstash Redis (optional — only checked when configured) ---
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = Redis.fromEnv();
      await redis.ping();
      checks.redis = 'ok';
    } catch (err) {
      checks.redis = 'error';
      console.error('[health] Redis check failed:', err);
      healthy = false;
    }
  }

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', timestamp: new Date().toISOString(), checks },
    { status: healthy ? 200 : 503 }
  );
}
