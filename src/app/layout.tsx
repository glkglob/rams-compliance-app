import type { Metadata } from 'next';
import { SentryUserContext } from '@/components/sentry-user-context';
import { AppHeader } from '@/components/layout/app-header';

import './globals.css';

// NOTE: We deliberately avoid `next/font/google` here.
// Fetching Inter from Google Fonts at build time made `next build` fail in
// network-restricted CI/CD and Railway deploy environments. The body now uses
// the Tailwind system font stack (`font-sans`), which is offline-safe and
// renders consistently on macOS/Windows/Linux/iOS/Android.
// To restore Inter (or any custom face), vendor the .woff2 files into
// `src/app/fonts/` and switch to `next/font/local` — that keeps builds
// reproducible without any outbound HTTP.

export const metadata: Metadata = {
  title: 'RAMS Compliance Review',
  description:
    'AI-powered RAMS text extraction and gap analysis. A secure, project-centric compliance workspace with role-based access and audit logging. Final compliance decisions are made and recorded by authorised human reviewers.',
};

// Lazy-import so a module-level crash in supabase-server never
// takes down the layout — failures are caught and silently ignored.
async function getSessionUser() {
  try {
    const { createServerSupabase } = await import('@/lib/db/supabase-server');
    const { ensureProfile } = await import('@/lib/auth/ensure-profile');
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Defensive profile guarantee: even if the DB trigger missed a historic
    // account, authenticated route loads heal it before dashboard/projects APIs
    // query role data.
    if (user) {
      await ensureProfile(user.id, user.email, user.user_metadata?.full_name as string | undefined);
    }

    return { userId: user?.id };
  } catch {
    // Non-fatal — layout still renders, Sentry just won't have user context.
    return { userId: undefined };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId } = await getSessionUser();

  return (
    <html lang="en" className="h-full">
      <body className="font-sans min-h-full bg-background text-foreground antialiased">
        <SentryUserContext userId={userId} />
        <div className="flex min-h-screen flex-col">
          <AppHeader />
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
                <a href="/pricing" className="hover:text-foreground transition-colors">
                  Pricing
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
