import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { validateEnv } from "@/lib/config/env";
import { createServerSupabase } from "@/lib/db/supabase-server";

import "./globals.css";

if (process.env.NODE_ENV !== "test" && process.env.NEXT_PHASE !== "phase-production-build") {
  validateEnv();
}

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "RAMS Compliance Review",
  description: "AI-powered RAMS document compliance review system",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch session for Sentry user context. Failures are non-fatal —
  // the layout still renders; Sentry just won't have user info for that render.
  let userId: string | undefined;
  let userEmail: string | undefined;
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id;
    userEmail = user?.email;
  } catch {
    // Silently ignore — this runs on every page load including unauthenticated ones.
  }

  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} min-h-full bg-background text-foreground`}>
        <div className="flex min-h-screen flex-col">
          <main className="flex-1 bg-background">{children}</main>

          <footer className="border-t bg-muted/30 py-6 text-sm text-muted-foreground">
            <div className="container mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
              <div>
                © {new Date().getFullYear()} RAMS Compliance Review. AI-assisted decision support tool.
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
              <div className="text-xs">
                For UK construction health &amp; safety compliance
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
