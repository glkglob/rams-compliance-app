import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import { getNextConfigHeaders } from '@/lib/security-headers';

const nextConfig: NextConfig = {
  // Critical for Railway/Nixpacks: Prevents webpack from trying to bundle native or complex Node modules.
  // Without this, tesseract.js, pdf-parse, mammoth, etc. often cause runtime errors or build warnings.
  serverExternalPackages: ['tesseract.js', 'pdf-parse', 'mammoth', 'xlsx', 'jszip', '@react-pdf/renderer'],

  // Enables minimal standalone output for Docker/Railway deploys (much smaller images, faster cold starts).
  output: 'standalone',

  // Security headers for page routes and static assets.
  // IMPORTANT: Route Handlers (/api/*) do NOT reliably receive these.
  // See middleware.ts for the cross-cutting implementation that also covers
  // all API responses + injects x-request-id for observability.
  async headers() {
    return getNextConfigHeaders();
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
