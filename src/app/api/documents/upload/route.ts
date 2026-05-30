import { NextResponse } from 'next/server';
import { extractText } from '@/lib/extractText';

export const runtime = 'nodejs'; // Required for pdf-parse / mammoth

// --- Simple in-memory IP rate limit for this unauthenticated demo endpoint ---
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;

const ipHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now >= entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

// Periodically evict stale entries to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipHits) {
    if (now >= entry.resetAt) ipHits.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();
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
    // Rate limit by IP
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    if (isRateLimited(ip)) {
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
      const message =
        extractionError instanceof Error ? extractionError.message : 'Unknown extraction error';
      return NextResponse.json(
        { error: `Failed to extract text: ${message}` },
        { status: 422 } // Unprocessable Entity
      );
    }

    // Success response matching requirements
    return NextResponse.json({
      filename: file.name,
      size: file.size,
      mimetype: file.type || 'application/octet-stream',
      extractedText,
      status: 'ready_for_review',
    });
  } catch (error) {
    console.error('[/api/documents/upload] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while processing the upload.' },
      { status: 500 }
    );
  }
}
