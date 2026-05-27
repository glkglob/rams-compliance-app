import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/config/env";

/**
 * Safe factory for browser (client component) Supabase usage.
 * 
 * During `next build` (when NEXT_PHASE=phase-production-build), env vars are
 * intentionally empty. We return a no-op client so that pages like /login
 * (which are marked force-dynamic but still have their client components
 * evaluated during the build's static generation workers) do not crash.
 */
export function createClient() {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    // Return a minimal no-op client. Only the methods used by the login page
    // (and any future client usage) need to be stubbed.
    return {
      auth: {
        signUp: async () => ({ data: { user: null, session: null }, error: null }),
        signInWithPassword: async () => ({ data: { user: null, session: null }, error: null }),
        // Add more stubs here if other client components start using auth methods
      },
    } as any;
  }

  const { supabaseUrl, supabaseKey } = getSupabaseEnv();

  return createBrowserClient(supabaseUrl, supabaseKey);
}
