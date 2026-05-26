import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { validateEnv } from "@/lib/config/env";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} min-h-full bg-background text-foreground`}>
        <main className="min-h-screen bg-background">{children}</main>
      </body>
    </html>
  );
}
