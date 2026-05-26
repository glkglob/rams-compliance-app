import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { validateEnv } from "@/lib/config/env";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { SentryUserContext } from "@/components/sentry-user-context";

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
        <SentryUserContext userId={userId} userEmail={userEmail} />
        <main className="min-h-screen bg-background">{children}</main>
      </body>
    </html>
  );
}
