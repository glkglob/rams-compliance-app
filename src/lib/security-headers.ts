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
 * The Next.js path matcher for middleware.
 *
 * Exported here (a pure-logic module) so tests can import it without pulling
 * in next/server, which is unavailable in the vitest jsdom environment.
 *
 * Covers: all pages, API routes, Server Actions.
 * Excludes: static assets (_next/static, _next/image, favicon, image files).
 */
export const MIDDLEWARE_MATCHER =
  '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)';

/** Known-safe patterns that must not appear in production CSP directives. */
const PRODUCTION_CSP_VIOLATIONS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /'unsafe-inline'/,
    message: "'unsafe-inline' found in CSP — removes XSS protection from inline scripts/styles",
  },
  {
    pattern: /'unsafe-eval'/,
    message: "'unsafe-eval' found in CSP — allows arbitrary code execution via eval()",
  },
  {
    pattern: /fonts\.googleapis\.com/,
    message: 'fonts.googleapis.com in CSP — external font CDN (vendor fonts locally instead)',
  },
  {
    pattern: /fonts\.gstatic\.com/,
    message: 'fonts.gstatic.com in CSP — external font CDN (vendor fonts locally instead)',
  },
  {
    pattern: /cdnjs\.cloudflare\.com|jsdelivr\.net|unpkg\.com/,
    message: 'Public CDN domain in CSP — load scripts from your own origin instead',
  },
  {
    // Matches bare * as a standalone CSP source token (e.g. "default-src *").
    // Does NOT match subdomain wildcards like *.supabase.co — those are fine.
    pattern: /(?:^|[\s;])\*(?:[\s;]|$)/,
    message: "Bare wildcard (*) used as CSP source — overly permissive, allows any origin",
  },
];

/**
 * Validates a production-mode CSP string and returns any detected violations.
 *
 * Returns an empty array if the CSP passes all checks.
 */
export function validateCspForProduction(csp: string): string[] {
  const violations: string[] = [];

  for (const { pattern, message } of PRODUCTION_CSP_VIOLATIONS) {
    if (pattern.test(csp)) {
      violations.push(message);
    }
  }

  if (!csp.includes("object-src 'none'")) {
    violations.push("Missing object-src 'none' — allows Flash/plugin-based attacks");
  }
  if (!csp.includes('frame-ancestors')) {
    violations.push('Missing frame-ancestors — page can be embedded in iframes (clickjacking)');
  }
  if (!csp.includes('base-uri')) {
    violations.push('Missing base-uri — allows base tag injection attacks');
  }

  return violations;
}

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
    // Next.js requires unsafe-eval only in development for enhanced debug stacks.
    // It stays disabled in production where strict-dynamic + nonce is enforced.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `font-src 'self' data:`,
    `img-src 'self' data: blob: ${SUPABASE_HOSTS}`,
    `connect-src 'self' ${SUPABASE_HOSTS} ${SENTRY_INGEST}${isDev ? ' ws: http://localhost:* http://127.0.0.1:*' : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  if (!isDev) {
    directives.push('upgrade-insecure-requests');
  }

  const csp = directives.join('; ');

  // In development, eagerly validate the production-mode CSP (built without
  // dev relaxations) so any regression is caught before it reaches production.
  if (isDev) {
    const productionCsp = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      `style-src 'self' 'nonce-${nonce}'`,
      `font-src 'self' data:`,
      `img-src 'self' data: blob: ${SUPABASE_HOSTS}`,
      `connect-src 'self' ${SUPABASE_HOSTS} ${SENTRY_INGEST}`,
      "worker-src 'self' blob:",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; ');

    const violations = validateCspForProduction(productionCsp);
    if (violations.length > 0) {
      // Use console.warn here intentionally: this is a startup diagnostic
      // that must surface even when the Pino logger isn't initialised yet.
      console.warn('[CSP] Production CSP validation failed:\n' + violations.map((v) => `  • ${v}`).join('\n'));
    }
  }

  return csp;
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
