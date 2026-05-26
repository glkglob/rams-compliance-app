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
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
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
  // Tree-shake the Sentry logger to reduce bundle size.
  disableLogger: true,
  // No Vercel Cron monitor wiring needed on Railway.
  automaticVercelMonitors: false,
});
