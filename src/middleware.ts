import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { getSupabaseEnv } from '@/lib/config/env';

/**
 * Edge Middleware for authentication protection and request ID injection.
 *
 * Every request gets a unique x-request-id header that propagates through
 * API routes, logging, and Sentry breadcrumbs for end-to-end correlation.
 */
export async function middleware(request: NextRequest) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  // --- Request ID ---
  // Honour an incoming header (from load balancer / Railway proxy), or generate one.
  const requestId =
    request.headers.get('x-request-id') ??
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

  // Inject into downstream request headers so API routes can read it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Expose request ID in the response for client-side debugging / support tickets.
  supabaseResponse.headers.set('x-request-id', requestId);

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
    return redirectResponse;
  }

  // --- Security headers on API responses ---
  if (request.nextUrl.pathname.startsWith('/api')) {
    supabaseResponse.headers.set('X-Frame-Options', 'DENY');
    supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff');
    supabaseResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - Static assets (svg, png, jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
