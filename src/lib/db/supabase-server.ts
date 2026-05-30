import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseEnv } from "@/lib/config/env";

/**
 * Safe factory for Server Components / Route Handlers.
 * During `next build` (static prerender phase) we return a no-op client
 * so builds don't hard-fail when Supabase env vars are not present in the
 * Docker/Railway build environment. Real calls will only happen at runtime.
 */
export async function createServerSupabase() {
  // During static generation at build time, env vars are intentionally absent.
  // Return a dummy client that will never be used at runtime.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
      from: () => ({
        select: () => Promise.resolve({ data: [], error: null }),
        // Add other chainable methods as no-ops if needed in the future.
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Build-phase no-op stub; never executed at runtime.
    } as any;
  }

  const cookieStore = await cookies();
  const { supabaseUrl, supabaseKey } = getSupabaseEnv();

  return createServerClient(supabaseUrl, supabaseKey, {
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
  });
}
