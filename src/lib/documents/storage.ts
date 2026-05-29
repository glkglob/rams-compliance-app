import type { SupabaseClient } from '@supabase/supabase-js';

import { logger } from '@/lib/logging';

/** Storage bucket holding compliance + RAMS documents. */
export const DOCUMENTS_BUCKET = 'documents';

/** Default signed-URL lifetime (seconds). */
const DEFAULT_SIGNED_URL_TTL = 60 * 60; // 1 hour

/**
 * Generate a short-lived signed URL for a stored document on demand.
 *
 * We deliberately do NOT persist signed URLs in the database — they expire and
 * go stale. Store only `storage_path` and call this when a URL is actually
 * needed (e.g. when listing or previewing documents). Returns null if no path
 * is provided or the URL could not be created.
 */
export async function getDocumentSignedUrl(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
  expiresIn: number = DEFAULT_SIGNED_URL_TTL,
): Promise<string | null> {
  if (!storagePath) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    logger.warn('Failed to create signed URL for document', {
      storagePath,
      error: error.message,
    });
    return null;
  }

  return data?.signedUrl ?? null;
}
