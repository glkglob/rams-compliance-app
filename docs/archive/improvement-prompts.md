# RAMS Compliance App — Implementation Prompts

These prompts execute the improvement plan in `docs/improvement-plan.md`
(or wherever you've stored it). Each prompt is self-contained — paste one
into a fresh agent session and it has enough context to ship a reviewable
change without re-deriving the codebase.

---

## Analysis of the plan against the current codebase (read first)

I cross-referenced every line of the plan against the actual repo before
writing these prompts. Notes you should weigh before scheduling work:

1. **The `embeddings.ts` referenced in plan §1.3 already exists** at
   `src/lib/ai/embeddings.ts`, and `pgvector` is already enabled — the
   Phase-1 foundation migration declares `embedding vector(1536)` on the
   compliance-requirements pipeline. Wiring it is smaller than the plan
   implies; the new work is mostly retrieval-side.

2. **The plan creates three different attachment patterns** —
   `rams_attachments` table for §1.1, `attachments TEXT[]` column for §2.1
   inspections, `document_url TEXT` for §2.3 certifications, plus implied
   daily-report photos. **Pick one.** Recommendation: one `attachments`
   table keyed by polymorphic `(parent_type, parent_id)` reused across all
   features. P1.1 below defines it; P2.1/P2.3/P2.4 reuse it.

3. **Three features generate PDFs** (1.2 evidence pack, 2.2 incident
   report, 2.4 daily report). Build the renderer once. P1.2 below ships a
   shared `lib/reports/pdf.ts` service.

4. **Notifications are not in the plan but several features need them**
   (cert expiry §2.3, optional incident escalation §2.2, daily report
   distribution §2.4). Resend is already wired via `sendEmail()`; QStash
   is already wired for async scheduling. Schedule expiry checks via the
   existing `src/lib/jobs/document-queue.ts` pattern.

5. **Pricing §1.5 is mostly a business decision, not a code task.**
   Don't schedule it as an engineering prompt until the tier numbers are
   final. The prompt below stubs the UI + Stripe wiring assuming the plan's
   numbers; revise before running.

6. **Phase 3 §3.2 (BIM/SharePoint/Procore/Fieldwire) is enterprise
   integration work** that should not be scoped from this plan alone.
   Each integration is its own multi-week project with vendor coordination,
   OAuth contracts, and rate-limit budgets. Treat the §3.2 prompt as a
   discovery-doc trigger, not a build prompt.

---

## Section 0 — Shared context (every prompt assumes this)

Every prompt below opens with `READ SHARED CONTEXT` — that means open
this section first. Each agent should treat these as house rules.

```text
SHARED CONTEXT — rams-compliance-app

Stack:
- Next.js 16 App Router. AGENTS.md at repo root flags that APIs may differ
  from your training data — consult node_modules/next/dist/docs/ when in
  doubt rather than guessing.
- Supabase (Postgres + Auth + Storage) with RLS on every project-scoped
  table. Service-role only used server-side in API routes.
- Tailwind v4 (CSS-only `@theme inline` in src/app/globals.css — no
  tailwind.config.ts). Use existing color tokens (`bg-background`,
  `text-foreground`, `border-input`, etc.).
- shadcn/ui components live in `src/components/ui/*` — reuse, don't
  re-skin.
- zod for all request/response validation.
- vitest for unit, Playwright for E2E.
- Pino logger via `@/lib/logging` (`logger.info|warn|error`). NEVER
  console.log in production code paths.

House rules (do not break):
- Lint must end at 0 warnings (`npm run lint`).
- Type-check must end clean (`npm run type-check`).
- Do NOT reintroduce `next/font/google` — the build must work offline.
  Use Tailwind's `font-sans` system stack or `next/font/local`.
- Every mutating API route MUST call `createAuditLog` from
  `@/lib/audit/audit-log`. If your action is sensitive, add the string
  to `CRITICAL_ACTIONS` in that file so a failed log is treated as a hard
  error.
- Permission gates use `@/lib/auth/permissions` (`canManageProject`,
  `canViewProject`, `isAdmin`). Don't roll your own role checks.
- Server-side Supabase access: `createServerSupabase()` from
  `@/lib/db/supabase-server`. Browser: `createClient()` from
  `@/lib/db/supabase-client`. Both have build-phase stubs — preserve
  them.
- Error handling: throw `UnauthorizedError`/`ForbiddenError`/etc. from
  `@/lib/error-handling`. Route handlers catch with `handleAPIError`.
- Env vars: declare in `src/lib/config/env.ts` zod schema; if optional
  use the `optionalString`/`optionalUrl` helpers.
- Migrations live in `supabase/migrations/YYYYMMDDNNNN_<name>.sql`. Use
  the Supabase MCP `apply_migration` tool — do NOT hand-edit applied
  migrations.
- E2E: real Supabase calls must skip when `process.env.E2E === 'true'`
  and the URL hostname includes 'placeholder' (see existing pattern in
  `e2e/rams-workflow.spec.ts`).
- Storage: private buckets only, RLS by project membership. Public URLs
  are minted on demand via `createSignedUrl`, never persisted.

Where things live:
- API routes: `src/app/api/<resource>/route.ts`
- App routes: `src/app/<segment>/page.tsx`
- Domain helpers: `src/lib/<domain>/`
- Tests: colocated `__tests__` folders next to the code
- E2E: `e2e/<feature>.spec.ts`

Validation at the end of every prompt:
1. `npm run lint`           — must exit 0
2. `npm run type-check`     — must exit 0
3. `npm test -- --run`      — all tests pass
4. `npm run build`          — succeeds (no network needed for fonts)
5. `npm run test:e2e -- --reporter=line --project=chromium` if you
   added or changed E2E tests
```

---

## Section 0.5 — Phase 0 prompts (Stability — do these first)

Within Phase 0 the sub-ordering is:
- **P0.1** (profile reliability) and **P0.3** (middleware + CSP) can run in parallel.
- **P0.2** (role consistency) is gated on P0.1 — auditing where role is read makes no sense until the row is guaranteed to exist.
- **P0.4** (Sentry context) is gated on P0.3 — it plugs into the request-id middleware injects.

---

### P0.1 — Profile row reliability (trigger + defensive upsert)

```text
READ SHARED CONTEXT.

Background you should know before starting:
- `public.profiles` is populated by an AFTER-INSERT trigger on
  auth.users — see `supabase/migrations/202605250001_phase_1_foundation.sql`
  (the `handle_new_user` function) and the hardening migration
  `202605300002_backfill_missing_profiles.sql` (ON CONFLICT DO NOTHING +
  backfill for pre-existing users).
- The trigger is therefore already idempotent and the backfill is
  already shipped. The residual problem this prompt targets is a
  *race condition* between signup completion and the FIRST API call
  the user makes — the trigger fires AFTER INSERT but Supabase Auth
  may return the session to the client before the trigger commit is
  observable, and certain API routes return 403 "Profile not found".

Task: Add a defensive server-side `ensureProfile()` helper that any
authenticated API route can call to guarantee the row exists before
reading from it. Plus tighten the small handful of routes that
currently fail when the row is missing.

Deliverables:
- New helper `src/lib/profiles/ensure-profile.ts`:
  - `ensureProfile(opts: { user: User; supabase: SupabaseClient }):
     Promise<Profile>` — runs an UPSERT on profiles using the
     auth user's id, email, and raw_user_meta_data full_name + role
     (mirroring the trigger logic). Uses ON CONFLICT (id) DO NOTHING
     semantics so it's a no-op when the trigger already won.
  - Logs `PROFILE_AUTOCREATED` to the audit log on actual insert
    (not on no-op). Non-critical action.
- Inline this helper at every authenticated API route that currently
  SELECTs from profiles before doing anything else. The pattern is:
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new UnauthorizedError();
    const profile = await ensureProfile({ user, supabase });
- Add a vitest covering both branches: row exists (no insert), row
  missing (insert + audit log emitted, returned profile correct).
- E2E gated on real Supabase: brand-new user → first call to a
  protected endpoint succeeds without "Profile not found".

Acceptance:
- A new user can call any of: GET /api/projects, GET /api/dashboard,
  GET /api/account immediately after signup (synthetic race in a
  vitest using a fresh auth.users row + delayed trigger) without
  getting a 403.
- The helper does NOT bypass RLS — it uses the user's own session
  client, so the UPSERT is gated by the existing INSERT policy.
- Lint, type-check, vitest, build, e2e clean.

Out of scope:
- Re-architecting profiles around an Edge Function on signup (heavy,
  unnecessary now that the trigger is idempotent).
- Profile self-service editing UI (separate feature, not Phase 0).
- Avatar upload (Phase 2-ish).
```

---

### P0.2 — Role consistency audit (storage ↔ UI)

```text
READ SHARED CONTEXT. Depends on P0.1 being merged.

Background:
- Role is stored in two places: `profiles.role` (global role —
  `admin`/`project_manager`/`reviewer`/`viewer`) and
  `project_members.role` (per-project role). The architecture doc
  flags this dual model as the source of UI ↔ API drift.
- The user's directive: audit and fix where roles are STORED vs where
  they are READ/DISPLAYED in the UI. No new roles, no broad refactor
  of the permission helpers — just consistency.

Task: Sweep the codebase for places where a UI element gates on a
role value that disagrees with what the API would actually enforce.
Produce a single PR that fixes each one, with a short doc summarising
the mental model.

Step-by-step:
1. Generate the audit. In a new throwaway file `scripts/audit-roles.ts`,
   grep for every occurrence of the literal strings `'admin'`,
   `'project_manager'`, `'reviewer'`, `'viewer'` in `src/` AND every
   call to `canManageProject`/`canViewProject`/`isAdmin`. Print a
   table: file path, line, role literal or helper used, what is being
   gated (button/route handler/menu item/etc.).
2. For each row, mark one of: CORRECT, WRONG (UI gates on
   profiles.role but API checks project_members.role), OPAQUE
   (helper used — already correct). Save as
   `docs/audit-role-checks.md`.
3. Fix every WRONG row: replace the literal role check with the
   appropriate helper from `src/lib/auth/permissions.ts`. If the
   helper doesn't cover the case, add a narrow new helper named for
   the specific decision (e.g. `canEditThreshold(projectId)`).
4. Update `docs/phase-1-technical-architecture.md` §3.2 to spell out
   the two-tier model (global role vs project-member role) and which
   helper to use for which decision. Two paragraphs, not a treatise.

Acceptance:
- `docs/audit-role-checks.md` exists with one row per identified gate.
- 0 WRONG rows remaining after the PR — every UI gate either uses a
  helper or has a row in the audit doc explaining why a literal is
  intentional.
- New vitest: for each helper, test the four canonical role
  combinations (admin, PM, reviewer, viewer) × (member, non-member).
- The throwaway `scripts/audit-roles.ts` is committed (small + useful
  for future audits).
- Lint, type-check, vitest, build clean.

Out of scope:
- Centralising every existing permission check (the directive said
  "only after that, consider centralizing"; explicit follow-up).
- New roles (e.g. principal_designer).
- Role-change audit-log UI polish.
```

---

### P0.3 — Middleware execution + CSP finalisation

```text
READ SHARED CONTEXT.

Background:
- Middleware lives at repo root `middleware.ts` (correct location for
  Next 16; `proxy.ts` is the alternative name some Next 16 docs
  prefer — confirm with `node_modules/next/dist/docs/` before
  renaming anything).
- Comments in `middleware.ts` say a previous matcher regression made
  `/api/*` skip middleware entirely. The current matcher is meant to
  cover everything except static assets.
- `src/lib/security-headers.ts` is the single source of truth for CSP
  and other headers. The production CSP is already strict: no
  `unsafe-inline`, no `unsafe-eval`, nonce + `strict-dynamic`.
- Known dead references in CSP: `style-src ... https://fonts.googleapis.com`
  and `font-src ... https://fonts.gstatic.com` are leftovers from the
  removed `next/font/google` import. Also
  `https://frontend-cdn.perplexity.ai` in font-src — verify it's still
  needed and remove if not.

Task: Verify middleware actually runs on every route, finalise the
CSP, and lock it down so regressions are caught by tests.

Deliverables:
- Add a vitest `src/lib/__tests__/middleware-coverage.test.ts` that
  uses the existing `next/server` mocks to exercise the middleware
  against representative paths and asserts:
  - `/`                         → x-request-id present, CSP present
  - `/dashboard`                → same
  - `/api/projects`             → same (the regression check)
  - `/api/health`               → same
  - `/login`                    → same
  - `/favicon.ico`              → middleware NOT applied
  - `/_next/static/foo.js`      → middleware NOT applied
- Add an e2e smoke `e2e/middleware-headers.spec.ts` (always runs,
  even with placeholder Supabase) that does a real HTTP request and
  asserts `x-request-id`, `content-security-policy`, and
  `strict-transport-security` are on the response for `/privacy`
  and `/api/health`.
- Clean dead CSP entries: remove `https://fonts.googleapis.com` from
  style-src and `https://fonts.gstatic.com` from font-src (kept the
  Perplexity CDN entry only if a grep confirms it's still referenced
  — otherwise also remove).
- Add a runtime assertion in dev mode (and only dev) that the CSP
  contains `'strict-dynamic'` and does NOT contain `'unsafe-inline'`
  or `'unsafe-eval'`. Log a warning to the console if violated. This
  catches future regressions early.

Acceptance:
- Hitting `/api/health` from `curl -I` returns x-request-id, CSP,
  HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff.
- Production build's CSP has zero references to fonts.google* hosts.
- The Playwright spec passes against a placeholder-Supabase dev
  server (the request never reaches Supabase, so no real backend
  needed).
- Lint, type-check, vitest, build, e2e clean.

Out of scope:
- Reporting endpoint (`report-uri` / `report-to`) — separate prompt
  once a Sentry CSP reports project is set up.
- Subresource Integrity (SRI) for third-party scripts — not needed
  while strict-dynamic is in place.
- Migrating middleware.ts → proxy.ts (only do this if Next 16's docs
  in `node_modules/next/dist/docs/` say `middleware.ts` is removed —
  it's still supported as an alias as of recent Next versions).
```

---

### P0.4 — Sentry server-side user + project context on every error

```text
READ SHARED CONTEXT. Depends on P0.3 (request-id middleware) being
verified.

Background:
- `src/components/sentry-user-context.tsx` sets `Sentry.setUser` on
  the CLIENT only. Server-side errors (RAMS review, document
  processing, evidence-pack generation — explicitly called out by the
  product team as the most diagnostic-critical flows) currently arrive
  in Sentry with no user identity and no project context.
- The middleware already injects `x-request-id` and there's a
  reference in middleware comments to `runWithRequestContext` (an
  AsyncLocalStorage-based request context). Plug Sentry into that
  context so every Sentry capture inside a request gets the user +
  project tags automatically.

Task: Build a `withSentryContext` helper that wraps API route
handlers AND key background-job entry points (process-document worker,
embed-chunks worker, cert-expiry worker) so that any error captured
inside them is automatically tagged with userId, projectId, and
requestId.

Deliverables:
- New module `src/lib/observability/sentry-context.ts`:
  - `withSentryContext(handler)`: HOF that, on every invocation,
    opens a `Sentry.withScope`, reads userId from the authed Supabase
    session, reads projectId from the request URL (params) or body,
    reads requestId from the request context, then sets:
      Sentry.setUser({ id: userId, email: profile.email })
      Sentry.setTag('project_id', projectId)
      Sentry.setTag('request_id', requestId)
      Sentry.setContext('route', { method, path })
    Returns the handler's response. ANY thrown error inside the
    scope captures with all this context attached.
  - Variant `withSentryContextJob(jobName)`: same shape but for
    background jobs where there's no `user` (uses service-role or
    job-payload userId).
- Apply `withSentryContext` to the highest-impact routes first:
  - POST `/api/rams/[ramsId]/review`
  - POST + GET `/api/rams/[ramsId]/report` (P1.2)
  - POST `/api/process-document` (existing worker route)
  - POST `/api/rams/[ramsId]/attachments` (after P1.1)
  - PATCH `/api/projects/[projectId]` (threshold changes)
  - POST `/api/rams/[ramsId]/resubmit` (after P1.4)
- Apply `withSentryContextJob` to the QStash document-processing
  worker entry and any new job entries from P1.3a / P2.3.
- Add explicit Sentry breadcrumbs at the start of each AI orchestrator
  phase (`extractRequirements`, `analyseRams`, `compareRamsToRequirements`,
  `generateExplanation`) so a failure during one phase shows the prior
  phases as breadcrumbs. Use `Sentry.addBreadcrumb({ category: 'ai',
  message, level: 'info', data: { phase, ... } })`.

Acceptance:
- Triggering a thrown error inside `/api/rams/[id]/review` produces a
  Sentry event tagged with user, project_id, request_id, and a route
  context. Verified via the test below or against a staging Sentry
  project.
- Vitest: `withSentryContext` calls `Sentry.setUser` / `setTag` with
  the expected values for a happy path and skips them gracefully when
  the user can't be resolved (job context).
- Lint, type-check, vitest, build clean.

Out of scope:
- Per-route performance transactions (`Sentry.startTransaction`) —
  separate prompt; involves tuning sample rate so cost stays sane.
- Source-map upload pipeline changes (already wired via SENTRY_AUTH_TOKEN).
- Migrating away from setUser/setTag to OTel semantic conventions —
  Phase 2+.
```

---

## Section 1 — Phase 1 prompts (Compliance Core)

### P1.1 — Unified attachments + photo evidence on RAMS

> Replaces plan §1.1. Adds the shared attachment layer the rest of
> Phase 2 will reuse.

```text
READ SHARED CONTEXT.

Task: Build a polymorphic attachments system and surface it first on
RAMS submissions. Reviewers and submitters must be able to attach
photos, drawings, and supporting docs. Every attachment is timestamped,
attributed, and audit-logged.

Scope:
- New table `attachments` keyed by (parent_type, parent_id). Phase 1
  parents: 'rams_submission'. Future parents (inspection, incident,
  daily_report, certification) reuse the same table without schema
  change.
- New private Supabase Storage bucket `attachments`. RLS lets a user
  read/write only when they have project membership on the parent's
  project. Service role can do anything.
- API: POST/GET/DELETE at `/api/rams/[ramsId]/attachments`. POST takes
  multipart with `file` + optional `caption`. GET lists with signed
  URLs (5-minute expiry). DELETE is soft (set deleted_at) — hard delete
  only via admin.
- UI: new "Attachments" tab on the RAMS detail page using shadcn
  Tabs. Drag-drop upload (reuse the pattern from
  `src/components/documents/compliance-documents-tab.tsx`). Show
  thumbnails for images, generic file icons otherwise. Display uploader
  name + timestamp. Caption inline-editable by the uploader or project
  manager.

Schema (new migration `YYYYMMDDNNNN_attachments.sql`):
  CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_type TEXT NOT NULL CHECK (parent_type IN (
      'rams_submission','inspection','incident','daily_report','certification'
    )),
    parent_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES profiles(id),
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    caption TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );
  CREATE INDEX attachments_parent_idx ON attachments(parent_type, parent_id);
  CREATE INDEX attachments_project_idx ON attachments(project_id);
  -- RLS: SELECT/INSERT for project members; DELETE only managers + uploader.

Audit:
- ATTACHMENT_UPLOADED (non-critical) — log on POST.
- ATTACHMENT_DELETED (non-critical) — log on DELETE.

Acceptance:
- Drag-drop a 5 MB JPEG onto a RAMS detail page; row appears within
  3 s with timestamp + uploader name.
- Refresh page; the attachment persists with a fresh signed URL.
- Non-member of the project gets 403 from GET and POST.
- Lint and type-check stay clean. Vitest covers the storage-path
  building helper and the RLS-shape unit (mocked Supabase).
- Add one Playwright spec in `e2e/rams-attachments.spec.ts` gated on
  real Supabase (use the placeholder-skip pattern from
  e2e/rams-workflow.spec.ts).

Out of scope (note as follow-ups):
- EXIF GPS extraction (do in P1.2 PDF if needed)
- Image thumbnails generation pipeline (use srcset on signed URL for
  now)
- Bulk download as ZIP (do in P1.2 evidence pack)
```

---

### P1.2 — Compliance evidence pack PDF

> Replaces plan §1.2. Ships the shared PDF service.

```text
READ SHARED CONTEXT.

Task: Generate a downloadable compliance evidence pack per RAMS
submission. Build a shared PDF service so later features (incident
report §2.2, daily report §2.4) plug into it without re-implementing.

Tech choice: `@react-pdf/renderer`. Reason: zero native binaries,
deterministic output, renders inside the Node runtime that already
ships in the Railway image. Do NOT use puppeteer — adds 200 MB to the
Docker layer and breaks on Railway's standalone build.

Deliverables:
- New module `src/lib/reports/`:
  - `pdf-renderer.tsx` — shared <Document> wrapper with our cover-page
    template, header/footer with page numbers, and project metadata
    block.
  - `evidence-pack.tsx` — RAMS-specific report body:
    cover (project name, submission id, submitter, reviewer, decision,
    date, compliance score), per-requirement table from `review_checks`
    (status, severity, AI evidence quote once P1.3 lands — until then,
    leave the column with "—"), audit trail summary, attachment
    thumbnails grid.
  - `index.ts` — barrel.
- API route `GET /api/rams/[ramsId]/report?format=pdf` streams the PDF.
  Project member gate via `canViewProject`. Audit-log a
  REPORT_DOWNLOADED row.
- UI: "Download evidence pack" button on the RAMS detail page header,
  next to the existing Send Email button. Disabled when the review is
  still pending.
- E2E: smoke-only — request the route, assert content-type
  application/pdf and a non-zero body length. No layout snapshotting.

Acceptance:
- 50-page PDF generates in under 4 s for a typical submission with 30
  checks and 10 attachments.
- Cover page shows compliance score and decision badge.
- Lint, type-check, vitest, build all clean.
- The pdf-renderer module exports a `renderToBuffer(node)` helper that
  P2.2 and P2.4 can call without knowing about RAMS specifics.

Out of scope:
- Signed/notarised PDFs (Phase 3 enterprise feature)
- Email delivery of the PDF (separate Resend wiring — do after P1.2 lands)
```

---

### P1.3a — pgvector retrieval schema for AI evidence

> Splits plan §1.3 into three reviewable prompts. This one is the
> schema + storage layer.

```text
READ SHARED CONTEXT.

Task: Stand up the embedding-storage schema and the chunk-write path.
No UI change yet.

Current state to preserve:
- `src/lib/ai/embeddings.ts` already implements OpenAI text-embedding-3-
  small calls and returns Float32 arrays of length 1536. Use it as-is.
- pgvector is already enabled (existing migration uses `vector(1536)`
  on the compliance-requirements path).

Deliverables:
- New migration `YYYYMMDDNNNN_rams_chunks.sql`:
    CREATE TABLE rams_chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rams_submission_id UUID NOT NULL REFERENCES rams_submissions(id) ON DELETE CASCADE,
      chunk_index INT NOT NULL,
      content TEXT NOT NULL,
      embedding vector(1536) NOT NULL,
      tokens INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (rams_submission_id, chunk_index)
    );
    CREATE INDEX rams_chunks_embedding_idx
      ON rams_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
  RLS: SELECT/INSERT/DELETE for project members of the parent submission's
  project; service role bypass.

- New module `src/lib/ai/chunk-pipeline.ts`:
  - `chunkText(text: string, opts?): Array<{ content: string; tokens: int }>`
    using the existing splitter pattern (target 500 tokens, 50-token
    overlap; use the `tiktoken` dep that's already in package.json).
  - `embedAndStoreChunks(ramsSubmissionId, text)`: chunks → calls
    `embedTextBatch` from `embeddings.ts` → inserts rows. Idempotent
    (deletes existing rows for the submission first, in a transaction).
  - Hooks into the existing document-processing queue
    (`src/lib/jobs/document-queue.ts`). When a RAMS document finishes
    extraction, enqueue an `EMBED_RAMS_CHUNKS` job that calls
    `embedAndStoreChunks`.

- Worker route: add a switch case in
  `src/app/api/process-document/route.ts` for the new job type so the
  QStash handler invokes the embedding step. Reuse the existing signing-
  key verification.

Acceptance:
- Upload a new RAMS document end-to-end (manual smoke): the document
  processes, the queue dispatches EMBED_RAMS_CHUNKS, and
  `rams_chunks` rows appear with `vector_dims(embedding) = 1536`.
- Reprocessing the same submission produces the same chunk count
  (idempotency).
- Vitest covers `chunkText` (deterministic input → expected splits).
- The embed call respects OPENAI_API_KEY; absent key → job fails with
  a logged error, not a silent skip.
- Lint, type-check, build, tests clean.

Out of scope:
- Reading chunks (P1.3b)
- UI evidence panel (P1.3c)
- Cost accounting / rate-limiting (covered by the existing
  OpenAI circuit breaker, but flag if usage spikes)
```

---

### P1.3b — Retrieval and per-requirement evidence

```text
READ SHARED CONTEXT. Depends on P1.3a being merged.

Task: At review time, retrieve the top-K most relevant chunks per
compliance requirement and pass them — not the full document — to the
LLM. Persist the matched chunk on each `review_check` so the UI in
P1.3c can show "this is why".

Schema additions (new migration):
  ALTER TABLE review_checks
    ADD COLUMN confidence_score NUMERIC(5,4) CHECK (confidence_score BETWEEN 0 AND 1),
    ADD COLUMN evidence_chunk_id UUID REFERENCES rams_chunks(id) ON DELETE SET NULL,
    ADD COLUMN evidence_quote TEXT,
    ADD COLUMN retrieval_metadata JSONB;
  -- retrieval_metadata = { topK, scores: number[], retrievedAt: iso }

Deliverables:
- New helper `src/lib/ai/retrieval.ts`:
  - `embedQuery(text)` → reuses embeddings.ts
  - `findRelevantChunks(ramsSubmissionId, queryEmbedding, k)` →
    runs `SELECT id, content, 1 - (embedding <=> $1) AS score FROM
    rams_chunks WHERE rams_submission_id = $2 ORDER BY embedding <=> $1
    ASC LIMIT $3`.
- Modify `src/lib/ai/orchestrator.ts` (the comparison phase):
  - For each requirement, build a query string from
    `requirement_text + " " + (severity ?? "")`.
  - Retrieve top-3 chunks.
  - Pass only those chunks (not the raw extracted_text) to the LLM
    explainer agent.
  - On the returned `ReviewCheck`, persist `confidence_score`,
    `evidence_chunk_id` (the best-scoring chunk), and the verbatim
    `evidence_quote` (a substring of that chunk no longer than 500
    chars).
  - Persist `retrieval_metadata` with the top-K scores for debugging.

Acceptance:
- Running a review on a 20-requirement / 30-page RAMS hits OpenAI fewer
  than 25 times (1 embed batch + 20 explainer calls) — down from the
  current ~1 per 8000 chars baseline.
- `review_checks.evidence_quote` is non-null for at least 80% of rows
  on a fresh review.
- Vitest mocks the embedding + DB layer and verifies the retrieval
  passes through correct K and respects circuit-breaker errors.
- Lint, type-check, build, tests clean.

Out of scope:
- Caching identical queries across reviews (Phase 2 cost optimisation)
- Reranking with a second model (defer)
```

---

### P1.3c — AI Evidence panel in the review UI

```text
READ SHARED CONTEXT. Depends on P1.3b being merged.

Task: Surface the AI's reasoning in the review UI so the reviewer can
verify (or override) every flagged requirement against the actual RAMS
text.

Deliverables:
- New component `src/components/rams/ai-evidence-panel.tsx`:
  - Takes a `ReviewCheck` (extended type from P1.3b) and renders a
    collapsible panel with:
    - Status badge (compliant / non-compliant / manual-review)
    - Confidence percentage (formatted to one decimal place)
    - The `evidence_quote` in a `<blockquote>` with the chunk index
    - The AI explanation
    - Buttons: "Confirm AI decision" (no-op, recorded) and "Override"
      (opens a textarea + status picker, then PATCHes the review_check)
  - Override path calls a new endpoint:
    `PATCH /api/rams/[ramsId]/review-checks/[checkId]` body
    `{ status, overrideReason }`. Audit-log OVERRIDE_RAMS_REVIEW
    (already in CRITICAL_ACTIONS).
- Wire the panel into the RAMS detail page replacing the current
  per-requirement row (`src/app/rams/[ramsId]/page.tsx`).
- Reuse `loadRAMS()` (already useCallback'd) to refresh after override.

Visual: match the existing surface — `border-input` cards, `font-sans`
body, lucide-react icons (CheckCircle / AlertTriangle / XCircle —
already imported on this page).

Acceptance:
- Reviewer can see the matched quote per requirement.
- Confirming an AI decision still produces an audit log entry
  (REVIEW_CHECK_CONFIRMED, non-critical).
- Overriding hits the PATCH route, persists the new status with
  override_reason, and logs OVERRIDE_RAMS_REVIEW.
- Vitest covers the panel render branches (compliant / non-compliant
  / manual-review / null quote).
- Playwright spec exercises one override flow against a seeded review;
  gated on real Supabase via the placeholder skip.
- Lint, type-check, build, tests clean.

Out of scope:
- Bulk override (one click → all manual-review become approved); defer.
- Diff view of original vs override; defer.
```

---

### P1.4 — RAMS version history

```text
READ SHARED CONTEXT.

Task: Resubmissions of a previously rejected RAMS become linked
versions, not isolated rows. Surface a version timeline on the project
page.

Schema:
  ALTER TABLE rams_submissions
    ADD COLUMN parent_submission_id UUID REFERENCES rams_submissions(id) ON DELETE SET NULL,
    ADD COLUMN version_number INT NOT NULL DEFAULT 1;
  CREATE INDEX rams_submissions_parent_idx ON rams_submissions(parent_submission_id);

  -- Constraint: if parent_submission_id is set, version_number must be
  -- exactly parent.version_number + 1. Enforce via a BEFORE INSERT trigger.

Backfill:
  -- All existing rows already default to version_number = 1 and parent
  -- NULL; no data backfill required.

API:
- New endpoint `POST /api/rams/[ramsId]/resubmit` accepting the same body
  as the existing submission create. It:
    - validates the parent is in status 'rejected' or 'manual_review',
    - inserts a new submission row with parent_submission_id set,
    - copies forward the submitter_id and other immutable fields,
    - audit-logs RAMS_RESUBMITTED.
- Modify GET `/api/rams/[ramsId]` to include a `versions` array with
  `[{ id, version_number, status, score, created_at }]` ordered desc.

UI:
- New tab on the project page (`src/app/projects/[projectId]/page.tsx`):
  "Submission History". Lists root submissions; expand to see versions
  with their scores, decisions, and a "view" link.
- On the RAMS detail page, add a small "Version N of M" badge next to
  the title and a quick-link dropdown to switch versions.

Acceptance:
- Resubmitting a rejected RAMS produces a v2 row linked to v1; v1
  remains untouched.
- The submission history tab renders both versions for the same
  ancestor.
- Cannot resubmit a currently-approved or pending RAMS (route returns
  409).
- Lint, type-check, vitest, build, e2e all clean.

Out of scope:
- Diff between two versions (Phase 2 nice-to-have)
- "Latest only" auto-archive of older versions (Phase 2)
```

---

### P1.5 — Pricing page + Stripe wiring (Starter, Professional)

> Stub — confirm tier numbers before running.

```text
READ SHARED CONTEXT.

CONFIRM BEFORE RUNNING:
- Are the tiers and prices in the plan final? (Starter £49, Professional
  £149, Enterprise custom.) If not, do not write the prompt yet —
  hard-coded prices are painful to change in copy + Stripe.
- Do you have a Stripe account, publishable + secret keys, and the
  Starter / Professional product+price IDs created? If not, create them
  first; this prompt assumes the IDs exist.

Task: Public pricing page and subscription flow for Starter +
Professional. Enterprise is a contact form only.

Deliverables:
- New page `src/app/pricing/page.tsx`. Three-column comparison, plan
  features bulleted, primary CTA per tier. Use shadcn `Card`.
- New env vars in `src/lib/config/env.ts`:
    STRIPE_SECRET_KEY (required server-side, optional in test/E2E)
    STRIPE_WEBHOOK_SECRET (required server-side, optional in test/E2E)
    NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID (required)
    NEXT_PUBLIC_STRIPE_PROFESSIONAL_PRICE_ID (required)
- New table `subscriptions`:
    id, profile_id, stripe_customer_id, stripe_subscription_id,
    tier ('starter'|'professional'|'enterprise'), status, current_period_end,
    created_at, updated_at.
- Routes:
    POST /api/billing/checkout — creates a Checkout Session and returns
      the URL. Auth required. Audit CHECKOUT_STARTED.
    POST /api/billing/webhook — Stripe webhook verifier (raw body!) for
      checkout.session.completed and customer.subscription.* events;
      upserts the subscriptions row. Audit
      SUBSCRIPTION_UPDATED (critical — billing state).
    GET /api/billing/portal — returns a Stripe customer portal URL for
      the authed user.
- Landing page CTAs: update primary button on `src/app/page.tsx` to
  link to `/pricing` instead of `/login`. Keep `/login` as the secondary
  link.
- Add a "Manage billing" link in the settings page that hits
  `/api/billing/portal` and 302s.

Acceptance:
- Anonymous visitor sees /pricing without auth; clicking Starter CTA
  prompts login then redirects to Stripe Checkout.
- Webhook handler verifies the signature against
  STRIPE_WEBHOOK_SECRET — does NOT trust the JSON body alone.
- Lint, type-check, build clean. Vitest mocks Stripe and covers
  webhook signature verification + the tier-extraction logic.
- E2E gated on real Stripe creds (skip otherwise).

Out of scope:
- Plan downgrade proration UI
- Per-seat billing (current tiers are flat)
- Enterprise self-serve (custom contracts)
```

---

## Section 2 — Phase 2 prompts (Operational Expansion)

### P2.1 — Digital safety inspection checklists

```text
READ SHARED CONTEXT. Depends on P1.1 attachments being merged.

Task: Project-scoped inspection templates + filled inspections. Replace
the plan's `inspections.attachments TEXT[]` with rows in the shared
`attachments` table.

Schema (new migration):
  CREATE TABLE inspection_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    checklist JSONB NOT NULL,   -- [{id, question, type:'yesno'|'text'|'multi', required, options?}]
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE TABLE inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES inspection_templates(id) ON DELETE SET NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    conducted_by UUID NOT NULL REFERENCES profiles(id),
    answers JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','overdue')),
    conducted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
  );
  -- RLS by project membership; managers can edit templates.

Deliverables:
- API routes under `/api/projects/[projectId]/inspections` (list/create)
  and `/api/inspections/[id]` (get/patch).
- Template CRUD under `/api/projects/[projectId]/inspection-templates`.
- UI:
  - New "Inspections" tab on project page.
  - List view with status badges + new-inspection button.
  - Conducting an inspection renders the template's checklist
    dynamically (yes/no toggles, text inputs, multi-select).
  - Photo upload per question via the shared attachments component
    from P1.1 — pass `parent_type='inspection'`, `parent_id=<inspection.id>`.
  - Corrective-action capture: any "no" answer to a required question
    forces a textarea + due-date picker → creates a task in the
    project's existing task list (if a tasks table exists; if not,
    flag as a follow-up).

Acceptance:
- Reviewer fills a 10-question scaffold inspection with 3 photos in
  under 60 s on mobile-width viewport.
- Marking the inspection resolved logs INSPECTION_RESOLVED.
- Templates seeded by an admin are visible across projects only if
  scoped that way (per-project for now; system-wide templates are
  Phase 3).
- Lint, type-check, vitest, build, e2e clean.
```

---

### P2.2 — Incident reporting linked to RAMS

```text
READ SHARED CONTEXT. Depends on P1.2 PDF service.

Task: RIDDOR-aligned incident report, linked back to the RAMS that
governed the relevant work. This is a unique differentiator — incident
↔ RAMS linkage closes the compliance loop.

Schema (new migration):
  CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    reported_by UUID NOT NULL REFERENCES profiles(id),
    occurred_at TIMESTAMPTZ NOT NULL,
    location_text TEXT,
    incident_type TEXT NOT NULL, -- 'injury','near-miss','property','environmental','dangerous-occurrence'
    severity TEXT NOT NULL,      -- 'minor','serious','riddor-reportable','fatal'
    description TEXT NOT NULL,
    immediate_actions TEXT,
    root_cause TEXT,
    corrective_actions TEXT,
    related_rams_submission_id UUID REFERENCES rams_submissions(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE incident_parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT,
    employer TEXT,
    injury_description TEXT
  );

Deliverables:
- API: list/create at `/api/projects/[projectId]/incidents`, get/patch at
  `/api/incidents/[id]`.
- UI: "Incidents" tab on project page. Reporting form with the schema
  fields. A combobox to attach a related RAMS — searches submissions
  on the same project (`related_rams_submission_id`).
- PDF export reusing `lib/reports/pdf-renderer`: include incident
  details, parties, related RAMS metadata.
- Photo attachments via the shared component
  (`parent_type='incident'`).
- Audit: every mutation logs INCIDENT_CREATED / INCIDENT_UPDATED /
  INCIDENT_RESOLVED. RIDDOR-reportable severity → mark INCIDENT_CREATED
  as critical.

Acceptance:
- Filing an incident on a project surfaces it on the project incidents
  tab within 2 s.
- The PDF includes the related RAMS submission ID and decision date.
- A RIDDOR-reportable severity triggers a critical audit log entry
  (verified via `isCriticalAuditAction`).
- Lint, type-check, vitest, build, e2e clean.

Out of scope:
- Direct submission to HSE F2508 (Phase 3, requires HSE API contract)
- SMS notifications to safety officer (deferred; would use Resend +
  Twilio later)
```

---

### P2.3 — Training & certification tracking

```text
READ SHARED CONTEXT. Depends on P1.1 attachments + QStash queue
already wired.

Task: Per-profile certification register with expiry tracking and
scheduled email reminders 30 / 7 days before expiry.

Schema:
  CREATE TABLE certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL, -- NULL = global
    certification_type TEXT NOT NULL, -- 'cscs','ipaf','pasma','first-aid','custom'
    custom_type TEXT,
    issuer TEXT,
    reference_number TEXT,
    issued_date DATE,
    expiry_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX certifications_expiry_idx ON certifications(expiry_date);

Deliverables:
- API: CRUD at `/api/certifications/[id]` and list-by-profile or
  list-by-project.
- UI: new section in `src/app/settings/page.tsx` "My certifications".
  Project pages get a "Team competency" tab listing members + their
  active certifications, with a red badge for any expired or expiring
  within 30 days.
- Cert document upload via the shared attachments component.
- Daily scheduled job that finds rows where expiry_date is exactly 30
  or 7 days away and dispatches a reminder via the existing
  `sendEmail()` helper. Implement as a QStash schedule, not a cron in
  Next.js. The job is a route handler in `src/app/api/jobs/cert-expiry/route.ts`
  triggered by a daily QStash schedule + CRON_SECRET bearer header.
- Integration check: when assigning a reviewer to a work-at-height
  RAMS, if their relevant cert (configurable mapping per project) is
  expired, surface a warning banner on the RAMS detail page.

Acceptance:
- Adding a cert with expiry_date set to 8 days from now triggers a
  reminder email on the next daily run (verified by inspecting the
  audit log + mock Resend).
- Expired certs render with a red badge and block reviewer assignment
  if mapped.
- Lint, type-check, vitest, build, e2e clean.

Out of scope:
- Calendar export (.ics) of expiries
- Automatic uplift from external training providers
```

---

### P2.4 — Daily site reports with weather auto-fill

```text
READ SHARED CONTEXT. Depends on P1.1 attachments + P1.2 PDF service.

Task: Per-project daily report form with weather auto-populated from
the Met Office DataPoint API (postcode-based). PDF export per report.

Schema:
  CREATE TABLE daily_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    submitted_by UUID NOT NULL REFERENCES profiles(id),
    weather JSONB,         -- { tempC, conditions, windKph, source: 'met-office' }
    crew JSONB,            -- [{ trade, count }]
    plant JSONB,           -- [{ description, hours? }]
    visitors JSONB,        -- [{ name, company, purpose }]
    activities TEXT,
    hs_observations TEXT,
    progress_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, report_date, submitted_by)
  );

Deliverables:
- New env var `MET_OFFICE_DATAPOINT_KEY` (optional in schema; missing
  → weather auto-fill silently disabled).
- New module `src/lib/weather/met-office.ts` with `fetchWeather(postcode,
  date)`. Cache by `(postcode, date)` in Redis (Upstash already wired
  via env) for 6 hours. Graceful degradation if API key absent or call
  fails.
- API at `/api/projects/[projectId]/daily-reports` (list/create) and
  `/api/daily-reports/[id]` (get/patch).
- UI: "Daily Reports" tab on project page. Calendar picker, weather
  panel that loads when project postcode is set, crew table, photo
  attachments (shared component), submit.
- PDF export per report using the renderer from P1.2.

Acceptance:
- Reports for a project on a single date are unique per submitter.
- Met Office failure does not block submission — weather block just
  reads "—".
- PDF includes crew + activities + photos.
- Lint, type-check, vitest, build, e2e clean.

Out of scope:
- Weekly rollup PDFs (Phase 3)
- Bulk distribution by email (Phase 3)
```

---

## Section 3 — Phase 3 prompts (briefer — discovery first)

### P3.1 — Progressive Web App / offline mode

```text
READ SHARED CONTEXT.

Task: Convert the app to a PWA with offline read for projects/RAMS and
queued submit for inspections + daily reports + incidents.

Pin these decisions before coding:
- Service worker tool: `next-pwa` is unmaintained for Next 16.
  Recommendation: write a custom SW using Workbox + `next/middleware`
  ServiceWorker registration, OR use `@serwist/next` (Workbox successor
  with active Next 14+ support — verify Next 16 compatibility before
  committing).
- Offline storage: IndexedDB via `idb-keyval` for queued mutations;
  do NOT use localStorage (size + perf).
- Conflict resolution: last-writer-wins on a 409 retry, with a UI
  badge "Synced X minutes ago" to surface staleness.

Out of scope for the first PWA prompt:
- Push notifications (Phase 3 follow-up; requires VAPID key
  infrastructure)
- Background sync of attachments larger than 5 MB (cap at 5 MB online-
  only for now)
```

---

### P3.2 — BIM / SharePoint / Procore / Fieldwire integrations

```text
DO NOT TREAT THIS AS A BUILD PROMPT.

Each integration is a multi-week project involving:
- Vendor account + OAuth app registration
- Rate-limit budget negotiation
- Compliance review of data egress (especially Procore drawings)
- Customer-side admin consent flow

Action for now: write a one-page discovery doc per integration
(target customer count, key endpoints needed, OAuth scope list,
estimated calls/day, cost). Schedule each integration as a separate
project once a discovery doc is approved.
```

---

### P3.3 — Read-only stakeholder portal

```text
READ SHARED CONTEXT.

Task: A token-authenticated URL per project for principal designers /
clients to view compliance state without an account.

Schema:
  CREATE TABLE portal_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,   -- random 32-byte, base64url
    audience TEXT,                -- free text e.g. "Client: Acme Constructors"
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

Deliverables:
- POST /api/projects/[projectId]/portal-tokens (manager-only).
- GET /portal/[token] — server component that resolves the token,
  renders a read-only dashboard: compliance score, approved RAMS list,
  outstanding items, evidence pack download links (signed URLs minted
  on request).
- Every portal view logs PORTAL_VIEWED with the token id.
- Revocation endpoint.

Acceptance:
- Revoked or expired token → 410 Gone, not 200.
- Portal does NOT call any authenticated Supabase endpoint;
  token authority is verified server-side and a service-role query
  fetches the read-only payload.
- Lint, type-check, vitest, build, e2e clean.
```

---

## Revised sequencing (current)

| Phase | Focus | Items | Notes |
|---|---|---|---|
| **Phase 0** | Stability | Profile bug + Roles + Security + Observability | Do this first — prompts P0.1–P0.4 below |
| **Phase 1a** | Core evidence | P1.1 (Attachments) + P1.2 (PDF service) | Highest immediate value |
| **Phase 1b** | AI differentiator | P1.3a → P1.3b → P1.3c | High risk — do carefully, sequentially |
| **Phase 1c** | Audit trail | P1.4 (Version History) | Relatively small |
| **Phase 2** | Closed loop | P2.2 (Incidents) → P2.1 (Inspections) | Both reuse Attachments + PDF |
| **Phase 3** | Supporting tools | P2.3 (Certs) + P2.4 (Daily Reports) | Lower priority |
| **Phase 4** | Advanced | P3.1 (PWA) + P3.3 (Stakeholder Portal) | Later |
| **Business** | Commercial | P1.5 (Pricing) + Marketing | Parallel track — non-engineering blocker for pricing |

### Why this order

- **Phase 0 first** because the AI differentiator (1.3) and the closed-loop incidents work (2.2) both compound any existing instability. Fixing profile/roles/security/observability now means the new surface area lands on stable ground.
- **P1.1 then P1.2** because the PDF cover page is more useful with attachment thumbnails — building 1.1 first means 1.2 can include them on day one without a back-fill.
- **P2.2 before P2.1** because incidents are the closed-loop differentiator (incident ↔ RAMS linkage) and reuse the PDF service immediately. Inspections introduce more UX surface and can come after the closed-loop story is selling.
- **Phase 4 last** because PWA + portal both want the data model stable; otherwise offline cache invalidation and portal payload contracts get rewritten twice.

---

## Sanity checks before each prompt runs

A reviewer (you) should confirm:
- The agent ran `npm install` if any new dep was added.
- The migration was applied via Supabase MCP `apply_migration`, NOT by
  editing previously-applied files.
- Audit-log strings for sensitive actions made it into
  `src/lib/audit/audit-log.ts` `CRITICAL_ACTIONS`.
- New env vars made it into `src/lib/config/env.ts` zod schema AND
  `.env.example` AND `.env.test.local.example`.
- Lint and type-check are clean — no `eslint-disable` without an inline
  rationale.
- No `console.log` in production paths.
- No `next/font/google`.
