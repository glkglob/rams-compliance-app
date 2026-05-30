import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import { SentryUserContext } from '@/components/sentry-user-context';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'RAMS Compliance Review',
  description:
    'A secure, project-centric compliance workspace with role-based access and audit logging — built to support AI-assisted RAMS review in upcoming phases.',
};

// Lazy-import so a module-level crash in supabase-server never
// takes down the layout — failures are caught and silently ignored.
async function getSessionUser() {
  try {
    const { createServerSupabase } = await import('@/lib/db/supabase-server');
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { userId: user?.id, userEmail: user?.email };
  } catch {
    // Non-fatal — layout still renders, Sentry just won't have user context.
    return { userId: undefined, userEmail: undefined };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId, userEmail } = await getSessionUser();

  // Read the per-request nonce set by proxy.ts. Calling headers() also opts
  // every route into dynamic rendering, which is required now that
  // 'unsafe-inline' is removed from script-src: each response must carry a
  // fresh nonce that Next.js applies to its scripts. The meta tag exposes the
  // nonce to client-side code that needs to render inline scripts.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en" className="h-full">
      {nonce ? <meta property="csp-nonce" content={nonce} /> : null}
      <body className={`${inter.className} min-h-full bg-background text-foreground`}>
        <SentryUserContext userId={userId} userEmail={userEmail} />
        <div className="flex min-h-screen flex-col">
          <main className="flex-1 bg-background">{children}</main>

          <footer className="border-t bg-muted/30 py-6 text-sm text-muted-foreground">
            <div className="container mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
              <div>
                © {new Date().getFullYear()} RAMS Compliance Review. A secure, project-centric
                compliance workspace.
              </div>
              <div className="flex gap-6">
                <a href="/privacy" className="hover:text-foreground transition-colors">
                  Privacy Policy
                </a>
                <a href="/terms" className="hover:text-foreground transition-colors">
                  Terms of Service
                </a>
                <a href="/dashboard" className="hover:text-foreground transition-colors">
                  Dashboard
                </a>
              </div>
              <div className="text-xs">For UK construction health &amp; safety compliance</div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
