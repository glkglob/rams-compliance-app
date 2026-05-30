import { NextResponse } from 'next/server';
import { extractText } from '@/lib/extractText';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { createAuditLog } from '@/lib/audit/audit-log';
import { apiErrorResponse, handleAPIError } from '@/lib/error-handling';
import { logger } from '@/lib/logging';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const runtime = 'nodejs'; // Required for pdf-parse / mammoth

// --- Upstash Redis sliding window rate limiter (optional — skipped when vars absent) ---
const upstashUrl   = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const ratelimit = upstashUrl && upstashToken
  ? new Ratelimit({
      redis: new Redis({ url: upstashUrl, token: upstashToken }),
      limiter: Ratelimit.slidingWindow(10, '1 m'),
      prefix: 'rl:upload',
    })
  : null;
// --- End rate limit ---

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB demo limit
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
];

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? '' : filename.slice(lastDot).toLowerCase();
}

function isSupportedFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  const mime = file.type.toLowerCase();

  const extSupported = ALLOWED_EXTENSIONS.includes(ext);
  const mimeSupported = ALLOWED_MIME_TYPES.includes(mime);

  return extSupported || mimeSupported;
}

export async function POST(request: Request) {
  try {
    // Auth guard — require a valid session
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit by IP
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const { success } = ratelimit ? await ratelimit.limit(ip) : { success: true };
    if (!success) {
      return NextResponse.json(
        { error: 'Too many upload requests. Please try again in a minute.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided. Please include a file in the "file" field (multipart/form-data).' },
        { status: 400 }
      );
    }

    // Basic validations
    if (file.size === 0) {
      return NextResponse.json({ error: 'Uploaded file is empty.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB for this demo.` },
        { status: 400 }
      );
    }

    if (!isSupportedFile(file)) {
      return NextResponse.json(
        {
          error: `Unsupported file type. Allowed: PDF (.pdf), Word (.docx, .doc), Text (.txt). Received: ${file.type || getFileExtension(file.name)}`,
        },
        { status: 400 }
      );
    }

    // Read file into Buffer for extraction
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedText: string;
    try {
      extractedText = await extractText(buffer, file.type, file.name);
    } catch (extractionError) {
      logger.warn('Document text extraction failed', {
        fileName: file.name,
        mimeType: file.type,
        error: extractionError instanceof Error ? extractionError.message : String(extractionError),
      });
      return apiErrorResponse({
        status: 422,
        error: 'Unable to extract text from the uploaded document.',
        code: 'DOCUMENT_EXTRACTION_FAILED',
      });
    }

    // Fire-and-forget audit log — do not block the response
    createAuditLog('document_uploaded', 'document', file.name, {
      userId: user.id,
      details: { filename: file.name, size: file.size, mimetype: file.type },
    }).catch(() => {/* non-fatal */});

    // Success response matching requirements
    return NextResponse.json({
      filename: file.name,
      size: file.size,
      mimetype: file.type || 'application/octet-stream',
      extractedText,
      status: 'ready_for_review',
    });
  } catch (error: unknown) {
    logger.error('Unexpected upload route failure', {
      error: error instanceof Error ? error.message : String(error),
    });
    return handleAPIError(error);
  }
}
