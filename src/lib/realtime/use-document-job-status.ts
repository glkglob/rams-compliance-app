"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/db/supabase-client";

/**
 * Status values mirrored from the `document_processing_jobs.status` enum.
 */
export type DocumentJobStatus = "pending" | "processing" | "completed" | "failed";

export interface DocumentJobUpdate {
  id: string;
  document_id: string;
  status: DocumentJobStatus;
  error_message: string | null;
  retry_count: number;
}

/**
 * SCAFFOLD — opt-in Supabase Realtime subscription for document processing jobs.
 *
 * The Compliance Documents tab currently polls `GET .../compliance-documents`
 * while any job is in flight. This hook is a drop-in alternative that pushes job
 * status changes over Supabase Realtime instead of polling, so the UI can update
 * the instant the background worker flips a job to `completed`/`failed`.
 *
 * It is intentionally NOT wired into the UI yet. To adopt it:
 *   1. Enable Realtime for the table (see the migration
 *      `2026..._enable_realtime_document_jobs.sql`, which adds it to the
 *      `supabase_realtime` publication).
 *   2. Call this hook from `compliance-documents-tab.tsx`, e.g.
 *        useDocumentJobStatus(projectId, (job) => {
 *          setDocuments((prev) => prev.map((d) =>
 *            d.id === job.document_id
 *              ? { ...d, extraction_status: job.status === "completed" ? "complete" : job.status }
 *              : d));
 *        });
 *      and remove the polling `useEffect`.
 *
 * RLS still applies to Realtime, so users only receive job rows for documents in
 * projects they belong to (per the `document_processing_jobs` SELECT policy).
 *
 * @param enabled  When false, no subscription is created (lets callers gate this
 *                 behind a feature flag while keeping the polling fallback).
 * @param onUpdate Invoked with the new row whenever a job is inserted/updated.
 */
export function useDocumentJobStatus(
  enabled: boolean,
  onUpdate: (job: DocumentJobUpdate) => void,
): void {
  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channel = supabase
      .channel("document-processing-jobs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_processing_jobs" },
        (payload: { new: DocumentJobUpdate | null }) => {
          if (payload.new) {
            onUpdate(payload.new);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, onUpdate]);
}
