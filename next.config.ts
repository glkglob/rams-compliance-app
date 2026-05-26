import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Prevent webpack from bundling these server-only packages.
  // They use dynamic worker loading, pure-ESM builds, or filesystem access
  // that webpack cannot statically trace — bundling them breaks next build.
  serverExternalPackages: ['tesseract.js', 'pdf-parse', 'mammoth', 'xlsx', 'jszip'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  async headers() {
    // Sentry ingest host derived from the project DSN.
    const sentryIngest = 'https://*.ingest.de.sentry.io';
    // Supabase hosts: REST API + realtime websocket.
    const supabaseHosts = 'https://*.supabase.co wss://*.supabase.co';

    const csp = [
      "default-src 'self'",
      // Next.js requires 'unsafe-inline' for its hydration scripts.
      "script-src 'self' 'unsafe-inline'",
      // Tailwind and shadcn/ui inject styles at runtime.
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      'font-src https://fonts.gstatic.com',
      // Supabase Storage signed URLs + local data URIs/blobs for previews.
      `img-src 'self' data: blob: ${supabaseHosts}`,
      // Supabase API calls from the browser + Sentry error reporting.
      `connect-src 'self' ${supabaseHosts} ${sentryIngest}`,
      // Disallow embedding this app in any frame.
      "frame-ancestors 'none'",
      // Prevent <base> tag hijacking.
      "base-uri 'self'",
      // Forms may only submit to this origin.
      "form-action 'self'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry organisation and project slugs — set in Railway / CI.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Only print Sentry build output in CI; stay quiet in local dev.
  silent: !process.env.CI,
  // Upload a larger set of source maps so stack traces are more readable.
  widenClientFileUpload: true,
  // Delete .map files from the deploy artifact after uploading to Sentry.
  sourcemaps: {
    filesToDeleteAfterUpload: ['.next/static/**/*.map'],
  },
});
