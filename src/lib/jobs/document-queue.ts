import { Client } from '@upstash/qstash';

import { logger } from '@/lib/logging';

export interface DocumentProcessingPayload {
  documentId: string;
  jobId: string;
  projectId: string;
}

/** Number of times QStash will retry delivery to the worker on failure. */
const QSTASH_MAX_RETRIES = 3;

let qstashClient: Client | null = null;

function getQStashClient(): Client {
  if (!qstashClient) {
    const token = process.env.QSTASH_TOKEN;
    if (!token) {
      throw new Error('QSTASH_TOKEN is not configured');
    }
    qstashClient = new Client({ token });
  }
  return qstashClient;
}

/** True when QStash is configured (used to decide whether async dispatch is available). */
export function isQStashConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN);
}

/**
 * Resolve the publicly reachable base URL of this app so QStash can call back
 * into /api/process-document. Prefers an explicit override, then common
 * platform-provided values (Railway, Vercel).
 */
export function getAppBaseUrl(): string {
  const explicit = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) {
    return `https://${railway}`.replace(/\/$/, '');
  }

  const vercel = process.env.VERCEL_URL;
  if (vercel) {
    return `https://${vercel}`.replace(/\/$/, '');
  }

  throw new Error(
    'Cannot determine app base URL for QStash callback. Set APP_URL (e.g. https://your-app.up.railway.app).',
  );
}

/**
 * Enqueue a document for background processing via QStash. QStash will POST the
 * payload to /api/process-document and retry automatically on failure. Throws
 * if QStash or the base URL is not configured — callers decide whether that is
 * fatal (the job row stays `pending` and can be retried later).
 */
export async function enqueueDocumentProcessing(
  payload: DocumentProcessingPayload,
): Promise<{ messageId: string }> {
  const client = getQStashClient();
  const url = `${getAppBaseUrl()}/api/process-document`;

  const result = await client.publishJSON({
    url,
    body: payload,
    retries: QSTASH_MAX_RETRIES,
  });

  logger.info('Enqueued document processing job', {
    documentId: payload.documentId,
    jobId: payload.jobId,
    messageId: result.messageId,
  });

  return { messageId: result.messageId };
}
