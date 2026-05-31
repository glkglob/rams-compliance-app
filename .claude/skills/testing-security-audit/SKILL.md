---
name: testing-security-audit
description: Test security headers, CSP changes, report endpoint authorization, and database migrations for the RAMS Compliance app. Use when verifying security-related PRs or audit remediation changes.
---

# Testing security & audit changes

This skill covers testing security-related changes: CSP header modifications, endpoint authorization, database migrations, and security header verification.

## Prerequisites

Follow the local dev setup from `testing-landing-copy` skill (placeholder `.env.local` + `npm run dev`).

## Testing CSP changes

### What works
- **Direct code verification:** Call `buildCsp()` from `src/lib/security-headers.ts` using `npx tsx -e` to verify CSP directive content. This is the most reliable method.
  ```bash
  npx tsx -e "
  import { buildCsp } from './src/lib/security-headers';
  const csp = buildCsp('test-nonce');
  console.log(csp);
  // Check for specific domains:
  console.log('Contains X:', csp.includes('X'));
  "
  ```
- **Unit tests:** Run `npx vitest run src/lib/__tests__/security-headers.test.ts` to verify CSP structure.
- **Console check:** Open browser DevTools Console and verify no "Refused to load..." CSP violation errors.

### What might NOT work
- **Browser Network tab / curl headers:** `middleware.ts` might not execute in the Next.js 16 dev server. If CSP, `x-request-id`, and `x-nonce` are absent from response headers, this is a known pre-existing issue — not a regression from your changes. Static headers from `next.config.ts` (HSTS, X-Frame-Options, etc.) will still appear.
- If middleware is not executing, the CSP content changes are still correct in code but have no runtime effect until middleware is fixed or migrated to `proxy.ts`.

## Testing endpoint authorization

Endpoint security changes (e.g., adding membership checks to `/api/rams/[ramsId]/report`) **require real Supabase auth** to test at runtime. Without Supabase credentials:
- Verify the code path via source review (check the authorization logic is placed before the main operation).
- Confirm the endpoint returns 403 for unauthorized users by reading the code.
- Note in your test report that this was verified via code review only.

## Testing database migrations

Migration files in `supabase/migrations/` require a Supabase instance to execute. Without one:
- Verify SQL syntax is valid (e.g., `CREATE INDEX IF NOT EXISTS` statements).
- Check that table and column names match the schema in the foundation migration.
- Note in your test report that migration was not executed.

## Verifying static security headers

These headers come from `next.config.ts` via `getNextConfigHeaders()` and are reliably served:
```bash
curl -s -D - http://localhost:3000/ -o /dev/null | grep -iE 'strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy'
```

Expected:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`

## Running the full test suite

```bash
npx vitest run          # 13 suites, 66+ tests
npx tsc --noEmit        # TypeScript type-check
npx next lint           # ESLint
```

All should pass with zero errors.

## CI

No code CI pipeline exists yet (PR #28 prepared a `ci.yml` but couldn't push due to OAuth scope restrictions). AI reviewers (CodeRabbit, cubic, copilot) run on PRs. Supabase Preview is typically skipped.

## Devin Secrets Needed

- **For landing page / CSP code testing:** None (placeholder env vars sufficient)
- **For full endpoint testing:** Supabase credentials (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- **For migration testing:** Supabase database access (`DATABASE_URL` with real connection string)
