# RAMS Compliance App

AI-powered RAMS (Risk Assessment & Method Statement) compliance review platform for the UK construction industry.

## Stack

- **Framework**: Next.js 16 (App Router)
- **Auth & Database**: Supabase
- **AI**: OpenAI (GPT-4 Turbo)
- **Email**: Resend
- **Hosting**: Railway

## Getting Started

Copy `.env.example` to `.env.local` and fill in your credentials, then:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `DATABASE_URL` | Supabase direct connection string (migrations) |
| `OPENAI_API_KEY` | OpenAI API key |
| `RESEND_API_KEY` | Resend API key |
| `NODE_ENV` | Set to `production` on Railway |
| `NODE_OPTIONS` | Set to `--max-old-space-size=4096` on Railway |

## Database

Run migrations against your Supabase project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## Deployment

Production deploys use pre-built Docker images from Docker Hub (see [DOCKER.md](DOCKER.md) for full details).

- Image: `k1dev2026/rams-compliance-app:latest`
- Railway is configured for image-based deploys (`railway.toml`)
- GitHub Actions builds + pushes on every push to `main`, then automatically triggers a Railway deploy (when `RAILWAY_TOKEN` secret is set)

Health endpoint: `/api/health` (always returns 200, reports `degraded` status in body when non-critical services are down).

## Scripts

```bash
npm run dev          # local dev server
npm run build        # production build
npm run lint         # ESLint
npm run type-check   # TypeScript check
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright end-to-end tests
```

## Observability (Request IDs + Request Context)

- Every inbound request propagates or generates `x-request-id` in `middleware.ts`.
- The request ID is injected into both request headers (for server-side access) and response headers (for client-side correlation).
- `src/lib/request-context.ts` provides AsyncLocalStorage-based request context:
  - `runWithRequestContext(...)` for route handlers
  - `withRequestContext(...)` route wrapper convenience
  - `runWithBackgroundContext(...)` for non-HTTP jobs/tasks
- Server Supabase auth (`createServerSupabase`) seeds request context from request headers and sets `userId` in context after successful `auth.getUser()`.
- Logs from `src/lib/logging.ts` automatically include `requestId`/`userId` when context exists.
- Sentry hooks (`src/lib/sentry/scrub.ts`) attach `request_id` tag (and user ID when available) to server-side events.
