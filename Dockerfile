# syntax=docker/dockerfile:1

# =============================================================================
# RAMS Compliance App - Production Dockerfile (Railway + Next.js 16 standalone)
# =============================================================================
# Benefits vs pure Nixpacks auto-generation:
# - No SecretsUsedInArgOrEnv warnings (secrets never appear in build args)
# - Minimal attack surface (non-root user, small image, only runtime files)
# - Explicit control + reproducible builds
# - Proper healthcheck instruction
# =============================================================================

FROM node:22-alpine AS base

# Install wget for healthcheck (alpine doesn't have it by default)
RUN apk add --no-cache wget

# -----------------------------------------------------------------------------
# 1. Dependencies layer (cached as long as package files don't change)
# -----------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Copy only manifests for better layer caching
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# -----------------------------------------------------------------------------
# 2. Builder layer (full source + build)
# -----------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Bring in deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next.js telemetry (keeps builds quiet and avoids network calls)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the app (uses standalone output from next.config.ts)
RUN npm run build

# -----------------------------------------------------------------------------
# 3. Production runner (minimal, non-root, only what we need at runtime)
# -----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user (principle of least privilege)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Create .next directory with correct ownership for standalone server
RUN mkdir -p .next && chown nextjs:nodejs .next

# Copy the minimal standalone output (this is the magic of output: 'standalone')
# It includes a pruned node_modules + server.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

EXPOSE 3000

# Docker/OCI healthcheck (Railway also runs its own via railway.toml)
# The /api/health endpoint is hardened to always return 200 (ok | degraded)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Standalone output produces server.js at the root of the standalone dir
CMD ["node", "server.js"]
