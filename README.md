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

Deployed on Railway. The `railway.toml` at the repo root defines the build and start commands. Push to `main` to trigger a deploy.

```
Build:  npm run build
Start:  npm start
Health: /api/health
```

## Scripts

```bash
npm run dev          # local dev server
npm run build        # production build
npm run lint         # ESLint
npm run type-check   # TypeScript check
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright end-to-end tests
```
