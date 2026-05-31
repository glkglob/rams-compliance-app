import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logging';

export const ATTACHMENTS_BUCKET = 'attachments';

/** Max file size accepted by the attachments API (must match bucket config). */
export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB

/** MIME types accepted for attachments. */
export const ATTACHMENT_ALLOWED_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

const SIGNED_URL_TTL = 60 * 60; // 1 hour — never persist; generate on demand

/**
 * Build the storage path for a new attachment.
 * Layout: {parent_type}/{parent_id}/{uuid}_{sanitized_filename}
 */
export function buildAttachmentStoragePath(
  parentType: string,
  parentId: string,
  attachmentId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  return `${parentType}/${parentId}/${attachmentId}_${safe}`;
}

/**
 * Generate a short-lived signed URL for an attachment.
 * Returns null on failure — callers should handle gracefully.
 */
export async function getAttachmentSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresIn = SIGNED_URL_TTL,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    logger.warn('Failed to create signed URL for attachment', {
      storagePath,
      error: error.message,
    });
    return null;
  }

  return data?.signedUrl ?? null;
}
