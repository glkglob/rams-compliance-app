import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Critical for Railway/Nixpacks: Prevents webpack from trying to bundle native or complex Node modules.
  // Without this, tesseract.js, pdf-parse, mammoth, etc. often cause runtime errors or build warnings.
  serverExternalPackages: ['tesseract.js', 'pdf-parse', 'mammoth', 'xlsx', 'jszip'],

  // Enables minimal standalone output for Docker/Railway deploys (much smaller images, faster cold starts).
  output: 'standalone',

  // Security headers (including CSP) applied to all responses.
  // Note: No middleware.ts is used in this project. All security headers are
  // provided here via the headers() function (applies to every route).
  async headers() {
    const sentryIngest = 'https://*.ingest.de.sentry.io https://*.ingest.sentry.io';
    const supabaseHosts = 'https://*.supabase.co wss://*.supabase.co';

    // CSP uses 'unsafe-inline' + 'unsafe-eval' because no per-request nonce
    // middleware is present. This is the primary (and only) CSP for the app.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      `font-src 'self' data: https://fonts.gstatic.com https://frontend-cdn.perplexity.ai`,
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
  // Updated to new non-deprecated config paths (avoids build warnings)
  webpack: {
    autoInstrumentAppDirectory: false,
    automaticVercelMonitors: false,
  },
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    filesToDeleteAfterUpload: ['.next/static/**/*.map'],
  },
});
