import { z } from 'zod';

export function getSupabaseEnv() {
  // NEXT_PUBLIC_* vars MUST be accessed as static string literals so the
  // Next.js bundler can inline them into the client bundle. Dynamic access
  // like `process.env[name]` is invisible to the compiler and will be
  // undefined on the client side.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return { supabaseUrl: '', supabaseKey: '' };
    }
    throw new Error(
      'Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY',
    );
  }

  // Helpful log + warning when running locally.
  // Suppressed during E2E runs (placeholder URLs would spam the test output)
  // and during static-prerender phases.
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.E2E !== 'true' &&
    typeof window === 'undefined'
  ) {
    const isLocal = supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost');

    if (isLocal) {
      console.log(`[Supabase] ✅ Using LOCAL instance: ${supabaseUrl}`);
    } else {
      console.warn(
        `\n[Supabase] ⚠️  WARNING: You are using REMOTE Supabase in development!\n` +
        `             URL: ${supabaseUrl}\n` +
        `             Consider running "npm run dev:local" instead.\n`
      );
    }
  }

  return { supabaseUrl, supabaseKey };
}

// Platforms like Railway inject configured-but-blank service variables as an
// empty string ("") rather than leaving them unset. An empty string still
// reaches validators like z.string().min(1) / z.string().url() and fails them,
// even though the intent is "not provided". That failure makes validateEnv()
// throw inside the instrumentation hook, so the process exits before binding
// its port and the /api/health check never gets a response. Treat empty or
// whitespace-only values as undefined so optional vars degrade gracefully.
const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  // Optional — sendEmail() degrades gracefully when this is unset, so we don't
  // want a missing value to crash the process at startup on Railway.
  RESEND_FROM_EMAIL: optionalString,
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Optional — rate limiting is disabled when absent (dev convenience).
  // Validated as required in production further below.
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  // Optional — async document processing via QStash. When unset, uploads
  // succeed but jobs stay `pending` (no background processing).
  QSTASH_TOKEN: optionalString,
  QSTASH_CURRENT_SIGNING_KEY: optionalString,
  QSTASH_NEXT_SIGNING_KEY: optionalString,
  // Optional — bearer secret allowing the processing worker to be triggered
  // without a QStash signature (manual/cron retriggering).
  CRON_SECRET: optionalString,
  // Optional — public base URL used for QStash callbacks (falls back to
  // RAILWAY_PUBLIC_DOMAIN / VERCEL_URL at runtime).
  APP_URL: optionalUrl,
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
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    APP_URL: process.env.APP_URL,
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
