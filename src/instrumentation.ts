import type { Instrumentation } from 'next';

export async function register() {
  // Only initialise Sentry in the Node.js runtime (not Edge).
  // Dynamic import keeps Sentry out of the Edge bundle entirely.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      // 10% of traces in production to control cost; 100% locally.
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      debug: false,
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
