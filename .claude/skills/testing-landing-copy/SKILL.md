---
name: testing-landing-copy
description: Run the RAMS Compliance app locally and verify public-facing copy (footer, SEO meta description, landing page sections). Use when testing landing page text, metadata, or footer changes.
---

# Testing landing-page / public copy changes

This app is Next.js (15/16) with Supabase. Public landing page `/` is largely static and renders without real backend data, so it's well-suited to local copy verification.

## Run the app locally

1. Install deps if needed: `npm install` (the repo may have stale `node_modules`; missing modules like `@upstash/qstash` indicate this).
2. The app validates required env vars at startup (`src/instrumentation.ts`) and returns HTTP 500 on `/` if they're missing. Create `.env.local` with placeholder values so the dev server boots:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<anything>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
   SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key
   OPENAI_API_KEY=sk-placeholder
   RESEND_API_KEY=re_placeholder
   DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres
   NODE_ENV=development
   ```
   (Placeholders are fine — the public landing page does not call these services. Adjust if the env schema changes.)
3. `npm run dev` → open http://localhost:3000.
4. If port 3000 is already in use, kill the existing process: `fuser -k 3000/tcp` or find the PID with `ss -tlnp | grep 3000` and `kill -9 <PID>`.

## Where public copy lives

- `src/app/layout.tsx` — sitewide: `export const metadata` (the `<meta name="description">`) AND the global footer tagline. These appear on EVERY page, so they're the highest-leverage place for overstated/inaccurate copy.
- `src/app/page.tsx` — the landing sections (hero badge/title, "What you can do today", "In development" cards with "Coming soon" badges, footer disclaimer).
- `src/app/privacy/page.tsx` / `terms/page.tsx` — legal copy (may still reference features as current — out of scope for landing tasks unless asked).

## How to verify

- **Footer / visible sections:** load `/` and scroll, or read the rendered DOM. Confirm exact strings and that removed text (e.g. old "AI-assisted decision support tool.") is gone.
- **SEO meta description:** open `view-source:http://localhost:3000/` and find `<meta name="description">`. The rendered DOM in devtools also works, but view-source is the cleanest proof for SSR meta tags.
- For copy-honesty tasks (don't overstate maturity): verify forward-looking features (document upload, AI review, compliance scoring) are clearly marked "Coming soon"/"In development" and not presented as available today.

## Known issue: middleware.ts might not execute in dev

As of Next.js 16, `middleware.ts` may not execute in the dev server. This means CSP headers, `x-request-id`, and `x-nonce` will be **absent** from HTTP responses even though the code is correct. Static security headers from `next.config.ts` (HSTS, X-Frame-Options, nosniff) still work. If you need to verify CSP content, use `npx tsx -e` to call `buildCsp()` directly from `src/lib/security-headers.ts` rather than relying on browser Network tab inspection.

## CI

PRs run cubic, copilot-pull-request-reviewer, CodeRabbit (AI reviewers) and a Supabase Preview check that is typically **skipped** (no hosted preview deploy for these PRs) — so test against a local build, not a preview URL.

## Devin Secrets Needed

None for local landing-copy testing — placeholder env vars are sufficient because the public `/` page doesn't hit Supabase/OpenAI/Resend.
