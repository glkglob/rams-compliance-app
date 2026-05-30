import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Critical for Railway/Nixpacks: Prevents webpack from trying to bundle native or complex Node modules.
  // Without this, tesseract.js, pdf-parse, mammoth, etc. often cause runtime errors or build warnings.
  serverExternalPackages: ['tesseract.js', 'pdf-parse', 'mammoth', 'xlsx', 'jszip'],

  // Enables minimal standalone output for Docker/Railway deploys (much smaller images, faster cold starts).
  output: 'standalone',

  // Security headers (CSP, HSTS, etc.) are now set per-request by
  // src/proxy.ts so that a fresh nonce can be injected into each response.
  // See proxy.ts for the full CSP policy.
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
