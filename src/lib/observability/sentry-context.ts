/**
 * Sentry context helpers for high-impact routes and AI workers.
 *
 * ## Why this exists
 *
 * `scrub.ts` `beforeSend` already auto-enriches every Sentry event with the
 * `requestId`, `userId`, and `route` stored in AsyncLocalStorage — but only
 * when they have been populated. Most routes never call `setRequestUserId()`
 * after auth, so errors reach Sentry without a userId. Project- and entity-
 * level identifiers (projectId, ramsId, documentId) are not in AsyncLocalStorage
 * at all and must be set as Sentry scope tags explicitly.
 *
 * ## Usage
 *
 * In a route handler, after auth succeeds and the entity IDs are known:
 *
 *   setSentryContext({ userId: user.id, projectId, ramsId });
 *
 * For background workers / QStash handlers (no userId):
 *
 *   setSentryContext({ projectId, documentId });
 *
 * For the AI orchestrator pipeline, call addOrchestratorBreadcrumb at each
 * major step so the Sentry issue timeline shows exactly where a failure occurred.
 */

import * as Sentry from '@sentry/nextjs';
import { setRequestUserId } from '@/lib/request-context';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SentryContextOptions {
  /** Authenticated user ID — propagated to both AsyncLocalStorage and Sentry scope. */
  userId?: string;
  /** Project the request operates on. */
  projectId?: string;
  /** RAMS submission being reviewed / emailed. */
  ramsId?: string;
  /** Compliance document being processed. */
  documentId?: string;
}

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Attach entity identifiers to the current Sentry scope and AsyncLocalStorage.
 *
 * - `userId` is written to both AsyncLocalStorage (for `scrub.ts` `beforeSend`)
 *   and directly to the Sentry `user.id` field.
 * - `projectId`, `ramsId`, `documentId` are set as Sentry tags so they appear
 *   in the issue sidebar and can be searched/filtered in Sentry.
 *
 * Safe to call multiple times — later calls merge into the existing scope.
 */
export function setSentryContext(options: SentryContextOptions): void {
  const { userId, projectId, ramsId, documentId } = options;

  if (userId) {
    // AsyncLocalStorage path: scrub.ts beforeSend reads this and sets user.id
    // on the event.  Also set it directly on the scope for completeness.
    setRequestUserId(userId);
    Sentry.setUser({ id: userId });
  }

  if (projectId) {
    Sentry.setTag('project_id', projectId);
  }
  if (ramsId) {
    Sentry.setTag('rams_id', ramsId);
  }
  if (documentId) {
    Sentry.setTag('document_id', documentId);
  }
}

/**
 * Run `fn` inside an isolated Sentry scope with the given context attached.
 *
 * Prefer this over `setSentryContext` in background workers / cron jobs where
 * you want scope isolation so one job's tags don't bleed into the next.
 */
export async function withSentryContext<T>(
  options: SentryContextOptions,
  fn: () => T | Promise<T>,
): Promise<T> {
  return Sentry.withScope(async (scope) => {
    const { userId, projectId, ramsId, documentId } = options;

    if (userId) {
      setRequestUserId(userId);
      scope.setUser({ id: userId });
    }
    if (projectId) scope.setTag('project_id', projectId);
    if (ramsId) scope.setTag('rams_id', ramsId);
    if (documentId) scope.setTag('document_id', documentId);

    return Promise.resolve(fn());
  });
}

// ── AI orchestrator breadcrumbs ────────────────────────────────────────────────

/**
 * Breadcrumb categories used by the RAMS review pipeline.
 * Keep this list stable — Sentry alerts may filter on these values.
 */
export type OrchestratorStep =
  | 'rams_loaded'
  | 'requirements_retrieved'
  | 'compliance_compared'
  | 'score_calculated'
  | 'review_persisted'
  | 'document_downloaded'
  | 'text_extracted'
  | 'chunks_embedded'
  | 'requirements_extracted'
  | 'document_processing_complete';

/**
 * Add a breadcrumb marking a step in the AI review / document-processing pipeline.
 *
 * Breadcrumbs appear in the Sentry issue timeline and are invaluable for
 * understanding which pipeline step preceded a failure.
 *
 *   addOrchestratorBreadcrumb('compliance_compared', { checks: 12 });
 */
export function addOrchestratorBreadcrumb(
  step: OrchestratorStep,
  data?: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({
    category: 'ai.orchestrator',
    message: step,
    level: 'info',
    data,
  });
}
