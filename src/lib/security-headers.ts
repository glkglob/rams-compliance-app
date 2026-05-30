/**
 * Centralized security headers configuration.
 *
 * This module is the single source of truth for:
 * - Content-Security-Policy
 * - HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, etc.
 *
 * Used by:
 * - next.config.ts headers() → applies to page routes and static assets
 * - middleware.ts → guarantees headers (including on all /api/* Route Handlers)
 *   and injects per-request x-request-id for observability + correlation.
 *
 * Why both places?
 * - next.config headers() is evaluated by the Next.js server for many responses.
 * - Route Handlers (e.g. under app/api/) frequently do not receive next.config
 *   headers automatically. Middleware is the only reliable cross-cutting way
 *   to stamp every response type (pages + API + Server Actions).
 */

export const SENTRY_INGEST = 'https://*.ingest.de.sentry.io https://*.ingest.sentry.io';
export const SUPABASE_HOSTS = 'https://*.supabase.co wss://*.supabase.co';

/**
 * Builds the CSP string used across the application.
 * Uses 'unsafe-inline' + 'unsafe-eval' because the project does not run
 * per-request nonce middleware (trade-off for simplicity and compatibility
 * with current component library + inline styles).
 */
export function buildCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' data: https://fonts.gstatic.com https://frontend-cdn.perplexity.ai`,
    `img-src 'self' data: blob: ${SUPABASE_HOSTS}`,
    `connect-src 'self' ${SUPABASE_HOSTS} ${SENTRY_INGEST}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** The standard security headers applied to every response. */
export const SECURITY_HEADERS: Array<{ key: string; value: string }> = [
  { key: 'Content-Security-Policy', value: buildCsp() },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

/**
 * Returns the full headers config array expected by next.config.ts.
 * This keeps the old behavior for page routes while the middleware
 * ensures API responses are also covered.
 */
export function getNextConfigHeaders() {
  return [
    {
      source: '/:path*',
      headers: SECURITY_HEADERS,
    },
  ];
}
