import type { Instrumentation } from 'next';

import { validateEnv } from '@/lib/config/env';

const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ??
  'https://c7e260230d234e1ba00c97e8f7a25e32@o4511401413050368.ingest.de.sentry.io/4511428182278224';

export async function register() {
  // Only run in the Node.js runtime (not Edge).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // === CRITICAL: Validate environment variables as early as possible ===
    // This ensures the app fails fast during startup if required secrets are missing.
    // Build-time guards inside validateEnv() prevent this from breaking production builds.
    if (process.env.NODE_ENV !== 'test') {
      try {
        validateEnv();
      } catch (error) {
        console.error('[Startup] Environment validation failed:', error);
        // In production we want the process to crash loudly
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
      }
    }

    // Initialise Sentry
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      sendDefaultPii: true,
      tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
      enableLogs: true,
      debug: false,
      // Only enable Sentry in production
      enabled: process.env.NODE_ENV === 'production',
    });
  }
}

// Called by Next.js on every server-side request error (Server Components,
// Route Handlers, Server Actions, proxy). Forwards to Sentry with full context.
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  const { captureRequestError } = await import('@sentry/nextjs');
  captureRequestError(err, request, context);
};
