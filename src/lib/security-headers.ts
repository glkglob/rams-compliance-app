/**
 * Centralized security headers configuration.
 *
 * This module is the single source of truth for:
 * - Content-Security-Policy
 * - HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, etc.
 *
 * Used by:
 * - next.config.ts headers() → applies non-CSP headers to static assets
 * - middleware.ts → guarantees headers (including nonce CSP on all /api/* Route Handlers)
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
 * Builds the per-request CSP used by middleware.
 *
 * Next.js 16 extracts the nonce from the request CSP and applies it to its
 * framework scripts/styles during dynamic rendering. Production deliberately
 * avoids unsafe-inline and unsafe-eval; development keeps the minimal relaxations
 * React/Next need for debugging and HMR.
 */
export function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com${isDev ? " 'unsafe-inline'" : ''}`,
    `font-src 'self' data: https://fonts.gstatic.com https://frontend-cdn.perplexity.ai`,
    `img-src 'self' data: blob: ${SUPABASE_HOSTS}`,
    `connect-src 'self' ${SUPABASE_HOSTS} ${SENTRY_INGEST}${isDev ? ' ws: http://localhost:* http://127.0.0.1:*' : ''}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  if (!isDev) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}

/** Security headers that do not require per-request values. */
export const STATIC_SECURITY_HEADERS: Array<{ key: string; value: string }> = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
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
      headers: STATIC_SECURITY_HEADERS,
    },
  ];
}
