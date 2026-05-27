import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { getSupabaseEnv } from '@/lib/config/env';

/**
 * Edge Middleware for authentication protection, request ID injection,
 * and nonce-based Content Security Policy.
 *
 * Every request gets a unique x-request-id header that propagates through
 * API routes, logging, and Sentry breadcrumbs for end-to-end correlation.
 *
 * A per-request CSP nonce is generated and passed via x-nonce so that
 * app/layout.tsx can apply it to <script> tags — avoiding unsafe-eval/unsafe-inline
 * while still allowing Next.js client runtime scripts to execute.
 */

function buildCsp(nonce: string): string {
  const sentryIngest =
    'https://*.ingest.de.sentry.io https://*.ingest.sentry.io';
  const supabaseHosts = 'https://*.supabase.co wss://*.supabase.co';

  return [
    "default-src 'self'",
    // 'strict-dynamic' allows scripts loaded by a nonced script to also run,
    // which is required for Next.js chunk loading.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    'font-src https://fonts.gstatic.com',
    `img-src 'self' data: blob: ${supabaseHosts}`,
    `connect-src 'self' ${supabaseHosts} ${sentryIngest}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  // --- Request ID ---
  const requestId =
    request.headers.get('x-request-id') ??
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

  // --- CSP Nonce ---
  // Generated fresh per-request using Web Crypto API (Edge compatible).
  // This replaces the previous Node.js 'crypto' + Buffer usage which breaks Edge runtime.
  const nonce = btoa(globalThis.crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Inject headers into downstream request so Server Components can read them.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-nonce', nonce);

  const supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Expose request ID in response for client-side debugging / support tickets.
  supabaseResponse.headers.set('x-request-id', requestId);

  // Apply CSP and security headers to every response.
  supabaseResponse.headers.set('Content-Security-Policy', csp);
  supabaseResponse.headers.set('X-DNS-Prefetch-Control', 'on');
  supabaseResponse.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  );
  supabaseResponse.headers.set('X-Frame-Options', 'DENY');
  supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff');
  supabaseResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // --- Supabase Auth ---
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // Refresh the session if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // --- Protected routes ---
  const protectedPaths = ['/dashboard', '/projects', '/settings'];

  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  if (isProtectedPath && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', request.nextUrl.pathname + request.nextUrl.search);

    const redirectResponse = NextResponse.redirect(url);
    redirectResponse.headers.set('x-request-id', requestId);
    // Apply CSP to redirect response too so the browser doesn't downgrade security
    // between the redirect and the login page render.
    redirectResponse.headers.set('Content-Security-Policy', csp);
    return redirectResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
