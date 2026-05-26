import type { Instrumentation } from 'next';

const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ??
  'https://c7e260230d234e1ba00c97e8f7a25e32@o4511401413050368.ingest.de.sentry.io/4511428182278224';

export async function register() {
  // Only initialise Sentry in the Node.js runtime (not Edge).
  // Dynamic import keeps Sentry out of the Edge bundle entirely.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      sendDefaultPii: true,
      tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
      enableLogs: true,
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
