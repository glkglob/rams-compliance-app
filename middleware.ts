/**
 * Application-wide middleware.
 *
 * Responsibilities (P1 security + observability):
 * - Inject a stable `x-request-id` on every incoming request (visible to
 *   route handlers via `headers()` / `runWithRequestContext` and to clients
 *   via the response header).
 * - Stamp **all** responses (including `/api/*` Route Handlers) with the
 *   security headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, ...).
 *
 * Why middleware is required here:
 * - `next.config.ts` `headers()` does not reliably apply to responses
 *   produced by Route Handlers (under app/api/ using NextResponse.json).
 * - Request ID propagation to the request context (AsyncLocalStorage) and
 *   back to the caller needs a per-request hook.
 *
 * This middleware deliberately runs on API routes (the previous proxy
 * matcher incorrectly skipped `/api/*`, causing the regression).
 *
 * Matcher excludes only static assets to keep overhead minimal.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { generateRequestId, REQUEST_ID_HEADER } from '@/lib/request-id';
import { buildCsp, STATIC_SECURITY_HEADERS } from '@/lib/security-headers';

export function middleware(request: NextRequest) {
  // Generate or propagate a request ID for correlation across logs, errors,
  // and client responses. Using a short, sortable format.
  const incomingId = request.headers.get(REQUEST_ID_HEADER);
  const requestId = incomingId || generateRequestId();
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Clone the request headers so downstream code (route handlers,
  // `runWithRequestContext`, server components) can read the id via
  // `headers().get('x-request-id')`.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  // Next.js reads the nonce from the request CSP during SSR and applies it to
  // framework scripts/styles. x-nonce is available for any explicit Script use.
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  // Let the request continue (with our injected header).
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Apply security headers to *every* response (pages + all API routes).
  // This is the reliable way to cover Route Handlers.
  for (const { key, value } of STATIC_SECURITY_HEADERS) {
    response.headers.set(key, value);
  }
  response.headers.set('Content-Security-Policy', csp);

  // Always echo the request ID in the response so clients, curl, and
  // API consumers can correlate their call with server logs.
  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set('x-nonce', nonce);

  return response;
}

/**
 * Matcher: run on everything except pure static assets.
 * This explicitly includes `/api/*`, Server Actions, pages, etc.
 *
 * NOTE: Next.js requires this to be a static string literal — it cannot
 * reference an imported variable. The same pattern is exported as
 * MIDDLEWARE_MATCHER from @/lib/security-headers for use in unit tests.
 * If you change this, update MIDDLEWARE_MATCHER to match.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
