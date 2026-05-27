import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  serverExternalPackages: ['tesseract.js', 'pdf-parse', 'mammoth', 'exceljs', 'jszip'],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },

  async headers() {
    const sentryIngest = 'https://*.ingest.de.sentry.io https://*.ingest.sentry.io';
    const supabaseHosts = 'https://*.supabase.co wss://*.supabase.co';

    // unsafe-eval is required by Next.js client runtime in all environments
    const scriptSrc = "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

    const csp = [
      "default-src 'self'",
      scriptSrc,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      'font-src https://fonts.gstatic.com',
      `img-src 'self' data: blob: ${supabaseHosts}`,
      `connect-src 'self' ${supabaseHosts} ${sentryIngest}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  autoInstrumentAppDirectory: false,
  automaticVercelMonitors: false,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    filesToDeleteAfterUpload: ['.next/static/**/*.map'],
  },
});
