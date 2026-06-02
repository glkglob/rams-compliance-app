# syntax=docker/dockerfile:1
# =============================================================================
# RAMS Compliance App - Production Dockerfile (Next.js 16 Standalone)
# =============================================================================

FROM node:22-alpine AS base

# Install minimal tools for healthcheck
RUN apk add --no-cache wget

# -----------------------------------------------------------------------------
# 1. Dependencies layer
# -----------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --frozen-lockfile && npm cache clean --force

# -----------------------------------------------------------------------------
# 2. Builder layer
# -----------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

RUN mkdir -p /app/public

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# -----------------------------------------------------------------------------
# Public build-time variables (required for Next.js client bundle)
# -----------------------------------------------------------------------------
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SENTRY_DSN

# Set as ENV so Next.js can inline them during build
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Improved validation with better error messages
RUN if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then \
      echo "ERROR: NEXT_PUBLIC_SUPABASE_URL build arg is required." && exit 1; \
    fi

RUN if [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then \
      echo "ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY build arg is required." && exit 1; \
    fi

# Build the app
RUN npm run build

# -----------------------------------------------------------------------------
# 3. Production runner (minimal & secure)
# -----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Create .next directory
RUN mkdir -p .next && chown nextjs:nodejs .next

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]