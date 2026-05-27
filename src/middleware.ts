import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { getSupabaseEnv } from '@/lib/config/env';

/**
 * Edge Middleware for authentication protection.
 *
 * This runs on the Edge runtime and provides server-side protection for
 * sensitive routes. It is the correct and recommended way to handle
 * unauthenticated redirects in Next.js.
 */
export async function middleware(request: NextRequest) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  // Create a Supabase client that works in the Edge runtime
  const supabaseResponse = NextResponse.next({ request });

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

  // IMPORTANT: Refresh the session if needed.
  // This must be awaited so cookies are properly set.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Define protected routes that require authentication
  const protectedPaths = ['/dashboard', '/projects', '/settings'];

  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  // Redirect unauthenticated users to login, preserving the intended destination
  if (isProtectedPath && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Add security headers to all API responses from the edge
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
