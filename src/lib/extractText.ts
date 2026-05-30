import { logger } from '@/lib/logging';

/**
 * Reusable text extraction utility for uploaded documents.
 * Supports: PDF, DOCX, DOC, TXT
 *
 * This is a focused implementation for the Document Upload & Extraction feature.
 * It reuses battle-tested logic from documents/extract-text.ts where possible
 * but provides a simple Promise<string> interface.
 */

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  const lowerMime = mimeType.toLowerCase();

  try {
    if (lowerMime === 'application/pdf' || ext === 'pdf') {
      return await extractFromPDF(buffer);
    }

    if (
      lowerMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerMime === 'application/msword' ||
      ['docx', 'doc'].includes(ext)
    ) {
      return await extractFromWord(buffer);
    }

    if (lowerMime === 'text/plain' || ext === 'txt') {
      return buffer.toString('utf-8').trim();
    }

    throw new Error(`Unsupported file type: ${mimeType || ext}`);
  } catch (error) {
    logger.error('Text extraction failed', {
      fileName,
      mimeType,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function extractFromPDF(buffer: Buffer): Promise<string> {
  try {
    const pdfParseModule = await import('pdf-parse');
    type PdfFn = (buf: Buffer) => Promise<{ text: string }>;
    const pdfParse = ((pdfParseModule as unknown as { default?: PdfFn }).default ??
      pdfParseModule) as PdfFn;

    const data = await pdfParse(buffer);
    const text = data.text?.trim() || '';
    if (text.length > 0) return text;

    // Fallback to OCR if PDF has no text layer (scanned doc) - reuse existing helper if available
    // For this focused utility we keep it simple and return what we have or throw
    throw new Error('PDF appears to be image-based with no extractable text layer');
  } catch (err) {
    // Re-throw with context
    throw new Error(`PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function extractFromWord(buffer: Buffer): Promise<string> {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value?.trim() || '';
  if (!text) {
    throw new Error('No text content found in Word document');
  }
  return text;
}
