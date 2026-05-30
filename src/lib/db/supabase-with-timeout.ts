import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getSupabaseEnv } from '@/lib/config/env';

/**
 * Creates a Supabase server client with request timeout protection.
 *
 * This is important for production reliability. Long-running Supabase queries
 * (especially in the orchestrator) can cause cascading failures.
 */
export async function createServerSupabaseWithTimeout(timeoutMs: number = 10000) {
  // During static generation at build time, return a safe no-op client.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
      from: () => ({
        select: () => Promise.resolve({ data: [], error: null }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Build-phase no-op stub; never executed at runtime.
    } as any;
  }

  const cookieStore = await cookies();
  const { supabaseUrl, supabaseKey } = getSupabaseEnv();

  const controller = new AbortController();
  // The timeout intentionally outlives this function — the AbortController
  // aborts in-flight fetches whenever it fires, and the timer is GC'd with the
  // controller after the request finishes. See note below.
  void setTimeout(() => controller.abort(), timeoutMs);

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components can read but cannot always write cookies during render.
        }
      },
    },
    global: {
      fetch: (input, init) => {
        return fetch(input, {
          ...init,
          signal: controller.signal,
        });
      },
    },
  });

  // Clean up the timeout if the request completes (best effort)
  // Note: We don't clear here because the client is long-lived in some cases.
  // The controller will be garbage collected after the request finishes.

  return supabase;
}

/**
 * Helper to create a Supabase client that fails fast on slow queries.
 * Recommended timeout values:
 * - Simple reads: 5-8 seconds
 * - Complex operations (orchestrator): 10-15 seconds
 */
export async function createServerSupabase(timeoutMs = 10000) {
  return createServerSupabaseWithTimeout(timeoutMs);
}
