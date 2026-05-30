# Codebase Analysis and Improvement Plan — 2026-05-30

## Scope

This report records a full repository health pass for the RAMS Compliance Next.js app. The pass covered:

- Repository structure and project instructions.
- Next.js 16 conventions relevant to the app (`proxy.ts` and `next/font`).
- Static analysis, TypeScript, unit tests, production build, E2E startup, dependency/security checks.
- Searches for stale/generated/old files and folders.
- A prioritized improvement plan.

## Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `rg --files -g 'AGENTS.md' -g 'package.json' -g 'next.config.*' -g 'tsconfig*.json' -g 'eslint.config.*' -g '.eslintrc*' -g 'vitest.config.*' -g 'jest.config.*' -g 'playwright.config.*' -g '!node_modules' -g '!dist' -g '!build'` | Pass | Located repo-level instructions/configuration. |
| `find node_modules/next/dist/docs -type f \| xargs rg -n "font\|Google Fonts\|next/font\|proxy\|middleware\|Route Handlers\|Turbopack"` | Pass | Confirmed local Next.js 16 docs before making conclusions about `proxy.ts` and `next/font`. |
| `npm run lint` | Pass with warnings | ESLint reported 36 warnings and 0 errors. |
| `npm run type-check` | Pass | TypeScript reported no errors. |
| `npm test -- --run` | Pass | Vitest reported 8 files / 46 tests passing. |
| `npm run build` | Fail | Turbopack build failed because `next/font/google` could not fetch Inter from Google Fonts. |
| `npm run test:e2e -- --reporter=line` | Blocked | Playwright dev server repeatedly errored on missing required environment variables. The server was killed after enough output confirmed the blocker. |
| `npm audit --audit-level=moderate` | Blocked | npm registry returned `403 Forbidden` for the audit endpoint. |
| `npx depcheck --json` | Blocked | npm registry returned `403 Forbidden` for the depcheck package. |
| `rg -n "TODO\|FIXME\|HACK\|XXX\|deprecated\|legacy\|remove me\|temporary\|workaround\|stub\|mock" -g '!node_modules' -g '!package-lock.json' -g '!*.svg' .` | Pass | Found a small set of marker comments; no TODO/FIXME backlog. |
| `find . -path './node_modules' -prune -o -path './.git' -prune -o -type f \( -iname '*.bak' -o -iname '*.old' -o -iname '*.orig' -o -iname '*~' -o -iname '*.tmp' -o -iname '*.backup' -o -iname '*copy*' -o -iname '*old*' \) -print` | Pass | No backup/copy/old files found. |
| `find . -maxdepth 3 \( -path './node_modules' -o -path './.git' \) -prune -o \( -name '.next' -o -name 'coverage' -o -name 'playwright-report' -o -name 'test-results' -o -name '.turbo' -o -name 'dist' -o -name 'build' \) -print` | Pass | Found ignored generated `.next/`. |
| `for f in public/*; do ... rg ...; done` | Pass | Confirmed default `public/*.svg` files are unreferenced. |
| `git status --short --ignored` | Pass | Working tree started clean; ignored build artifacts exist locally. |

## High-Severity Findings

### 1. GitHub Actions workflow contains unresolved merge conflict markers

`.github/workflows/docker.yml` has literal `<<<<<<< HEAD`, `=======`, and `>>>>>>>` markers in the committed file. This makes the workflow invalid YAML and will break CI/CD before Docker/Railway deployment can run.

Specific problems:

- Conflict markers appear under `permissions`, around the Docker build step name/id, and before the Railway deploy job.
- The Railway job uses `needs: docker`, but the visible job key is `build-and-push`; after resolving the conflict, the dependency name must be verified.

Recommended fix: resolve the conflict manually, preserve the desired Docker build output digest, set a valid job dependency, and run a YAML/workflow validation check.

### 2. Production build is not reproducible without outbound Google Fonts access

`npm run build` failed in `next/font/google` while trying to fetch Inter from `https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap`.

Next.js 16 local docs explain that Google font CSS and files are downloaded at build time and then self-hosted with the app. That means a network-restricted CI or deploy environment can fail even though browser requests to Google are avoided at runtime.

Recommended fix options:

1. Vendor Inter with `next/font/local` so builds do not depend on Google Fonts availability.
2. Keep `next/font/google` only if CI/deploy egress to Google Fonts is guaranteed and monitored.
3. Add a build smoke test in CI that runs in the same network policy as production image creation.

### 3. E2E startup fails without required env vars

`npm run test:e2e -- --reporter=line` started `npm run dev`, but the app repeatedly threw missing environment variable errors from `validateEnv()` and `getSupabaseEnv()`.

Required missing variables observed in the run:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `DATABASE_URL`
- One of `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Recommended fix: create a dedicated E2E environment strategy. Either:

- Load safe placeholder/local values before Playwright starts, or
- Start Supabase locally and point E2E at real local services, or
- Make public/static E2E paths gracefully skip backend validation when explicitly running in `NODE_ENV=test` / a dedicated `E2E=true` mode.

## Medium-Severity Findings

### 4. ESLint has 36 warnings that should be driven to zero

`npm run lint` completed with 0 errors and 36 warnings. Main categories:

- `@typescript-eslint/no-explicit-any` across API routes, Supabase clients, and AI orchestration code.
- `@typescript-eslint/no-unused-vars` in several routes/pages/libs.
- `react-hooks/set-state-in-effect` in login, RAMS detail, and compliance document tab components.
- `react-hooks/exhaustive-deps` in the RAMS detail page.

Recommended fix: treat warnings as a quality gate after cleanup. Start with unused variables and hook warnings, then replace `any` with typed Supabase, route, and AI response models.

### 5. Dependency/security automation could not run in this environment

Both dependency/security checks were blocked by registry access policy:

- `npm audit --audit-level=moderate` returned `403 Forbidden` from the npm advisory endpoint.
- `npx depcheck --json` returned `403 Forbidden` when fetching `depcheck`.

Recommended fix: add an internal/CI dependency security job that runs in an environment with approved registry access. If that is not possible, pin an allowed dependency scanner in `devDependencies` or use GitHub Dependabot/Security Advisories.

### 6. Documentation is partially stale relative to implemented threshold management

`docs/phase-1-technical-architecture.md` still lists missing threshold UI as a Phase 1 gap, but the project settings page already includes threshold editing UI and the PATCH route logs threshold changes.

Recommended fix: split planning docs into:

- `docs/current-architecture.md` for implemented behavior.
- `docs/roadmap.md` for remaining work.
- Archive or clearly mark phase docs as historical when their gaps are completed.

## Old / Stale / Generated Files and Folders

### Confirmed generated local artifacts

- `.next/` exists locally and is ignored by `.gitignore`.
- `tsconfig.tsbuildinfo` exists locally and is ignored by `.gitignore`.

No action needed unless the workspace should be cleaned before packaging. They are not tracked.

### Unreferenced starter assets

The following files under `public/` have no references in source/docs/config searches:

- `public/file.svg`
- `public/globe.svg`
- `public/next.svg`
- `public/window.svg`

Recommended fix: remove them if the product does not intentionally expose them, or replace them with branded assets.

### Claude-specific agent artifacts

The repo includes:

- `CLAUDE.md`, which only points to `AGENTS.md`.
- `.claude/launch.json`.
- `.claude/skills/testing-landing-copy/SKILL.md`.

These may be useful if the team uses Claude locally, but they are not runtime app files. Recommended fix: decide whether these should stay committed as team tooling, move to docs, or be removed to reduce repo noise.

### No backup/copy/old file patterns found

No `*.bak`, `*.old`, `*.orig`, `*.tmp`, `*.backup`, `*copy*`, or `*old*` files were found outside ignored dependency/git folders.

## Positive Findings

- TypeScript passes with `tsc --noEmit`.
- Unit/component tests pass: 8 test files, 46 tests.
- ESLint reports no errors, only warnings.
- `.gitignore` already excludes common generated files including `.next/`, `coverage/`, `test-results/`, `playwright-report/`, and `*.tsbuildinfo`.
- The app has a coherent App Router structure with route handlers under `src/app/api`, shared libraries under `src/lib`, UI components under `src/components`, E2E tests under `e2e`, and Supabase migrations under `supabase/migrations`.
- The project is already using the Next.js 16 `proxy.ts` convention, which is the documented replacement for deprecated `middleware` naming.

## Prioritized Improvement Plan

### P0 — Restore CI/CD and reproducible builds

1. Resolve `.github/workflows/docker.yml` merge conflict markers.
2. Fix the Railway job dependency name and validate the workflow syntax.
3. Replace `next/font/google` Inter with `next/font/local`, or guarantee network access to Google Fonts during builds.
4. Re-run `npm run build` in the same container/network environment used by CI/deploy.

### P1 — Make automated validation complete

1. Add an E2E env bootstrap file or Playwright `webServer.command` that loads `.env.test.local` / placeholders.
2. Decide whether E2E should use local Supabase or mocked backend behavior.
3. Add CI steps for `npm run lint`, `npm run type-check`, `npm test -- --run`, `npm run build`, and Playwright once env is solved.
4. Enable dependency/security scanning in an approved registry environment.

### P2 — Reduce code quality warnings

1. Remove unused imports/variables.
2. Fix React hook warnings by moving synchronous initialization out of effects where appropriate or restructuring data loading callbacks/dependencies.
3. Replace broad `any` usage with typed API payloads, Supabase generated types, and AI result schemas.
4. Consider failing CI on ESLint warnings after the warning count reaches zero.

### P3 — Clean stale files/docs

1. Remove or replace unreferenced default SVG assets in `public/`.
2. Decide whether `.claude/` and `CLAUDE.md` are official team tooling; if not, remove them.
3. Update Phase 1 docs to reflect implemented threshold UI/audit behavior or move stale planning docs to an archive.
4. Add a short `docs/architecture.md` that reflects current runtime structure and operational requirements.

### P4 — Hardening and maintainability

1. Standardize API-route permission/audit patterns across all mutating project-scoped routes.
2. Add tests around permission denial and audit logging for membership and threshold updates.
3. Add a local `npm run validate:ci` script that runs non-interactive checks consistently (`lint`, `type-check`, unit tests, build).
4. Document required env vars by environment: local dev, E2E, CI build, production runtime, background processing.
