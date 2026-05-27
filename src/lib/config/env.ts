import { z } from 'zod';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // During static prerender at build time, runtime-injected env vars are not
    // yet available. Return a safe placeholder rather than aborting the build —
    // the real values will be present when the app runs.
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return '';
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseEnv() {
  // NEXT_PUBLIC_* vars MUST be accessed as static string literals so the
  // Next.js bundler can inline them into the client bundle.  Dynamic access
  // like `process.env[name]` is invisible to the compiler and will be
  // undefined on the client side.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return { supabaseUrl: '', supabaseAnonKey: '' };
    }
    throw new Error(
      'Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY',
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Optional — rate limiting is disabled when absent (dev convenience).
  // Validated as required in production further below.
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  if (!result.success) {
    const missingVars = result.error.issues.map(e => e.path.join('.')).join(', ');
    throw new Error(`Missing or invalid environment variables: ${missingVars}`);
  }

  const { NODE_ENV, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = result.data;
  const upstashMissing = !UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN;
  if (upstashMissing) {
    const msg = 'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set — rate limiting will be disabled.';
    if (NODE_ENV === 'production') {
      throw new Error(msg);
    }
    console.warn(`[env] ${msg}`);
  }

  return result.data;
}
