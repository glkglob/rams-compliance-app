import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Critical for Railway/Nixpacks: Prevents webpack from trying to bundle native or complex Node modules.
  // Without this, tesseract.js, pdf-parse, mammoth, etc. often cause runtime errors or build warnings.
  serverExternalPackages: ['tesseract.js', 'pdf-parse', 'mammoth', 'xlsx', 'jszip'],

  // Enables minimal standalone output for Docker/Railway deploys (much smaller images, faster cold starts).
  output: 'standalone',

  experimental: {
    // Prevents the /_global-error prerender crash with @sentry/nextjs + Next.js 16
    prerenderEarlyExit: false,
  },

  // NOTE: Per-request security headers (including a nonce-based CSP) are set in
  // src/middleware.ts on every matched response. The headers below are a
  // defence-in-depth fallback that applies to paths the middleware does NOT
  // match (Next static assets, images, favicon). The middleware's nonce-based
  // CSP supersedes the static CSP defined here for all app routes.
  async headers() {
    const sentryIngest = 'https://*.ingest.de.sentry.io https://*.ingest.sentry.io';
    const supabaseHosts = 'https://*.supabase.co wss://*.supabase.co';

    // 'unsafe-eval' is required by the Next.js client runtime; this fallback CSP
    // is only applied to static asset paths where middleware does not run.
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
