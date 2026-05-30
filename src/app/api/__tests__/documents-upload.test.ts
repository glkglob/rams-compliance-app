import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../documents/upload/route';

// Mock the extraction utility
vi.mock('@/lib/extractText', () => ({
  extractText: vi.fn(),
}));

import { extractText } from '@/lib/extractText';

const mockExtractText = vi.mocked(extractText);

describe('POST /api/documents/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createRequestWithFile(file: {
    name: string;
    type: string;
    size: number;
    content?: string;
  } | null): Request {
    const mockFormData = {
      get: (key: string) => {
        if (key !== 'file' || !file) return null;

        return {
          name: file.name,
          type: file.type,
          size: file.size,
          arrayBuffer: async () =>
            new TextEncoder().encode(file.content ?? '').buffer,
        } as unknown as File;
      },
    };

    const request = new Request('http://localhost:3000/api/documents/upload', {
      method: 'POST',
    });

    // Override formData() to return our controlled mock
    request.formData = async () => mockFormData as unknown as FormData;

    return request;
  }

  it('returns 400 when no file is provided', async () => {
    const request = createRequestWithFile(null);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('No file provided');
  });

  it('returns 400 for unsupported file type', async () => {
    const request = createRequestWithFile({
      name: 'photo.jpg',
      type: 'image/jpeg',
      size: 12345,
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Unsupported file type');
  });

  it('returns 200 with correct JSON shape on successful TXT extraction', async () => {
    const content = 'Hello from a test TXT file.\nLine two.';

    mockExtractText.mockResolvedValueOnce(content);

    const request = createRequestWithFile({
      name: 'notes.txt',
      type: 'text/plain',
      size: 37,
      content,
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toEqual({
      filename: 'notes.txt',
      size: 37,
      mimetype: 'text/plain',
      extractedText: content,
      status: 'ready_for_review',
    });
  });

  it('returns 422 when text extraction fails', async () => {
    mockExtractText.mockRejectedValueOnce(new Error('Corrupted PDF structure'));

    const request = createRequestWithFile({
      name: 'bad.pdf',
      type: 'application/pdf',
      size: 999,
    });

    const response = await POST(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toContain('Failed to extract text');
    expect(data.error).toContain('Corrupted PDF');
  });

  it('handles extraction failure with non-Error rejection', async () => {
    mockExtractText.mockRejectedValueOnce('boom');

    const request = createRequestWithFile({
      name: 'weird.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 100,
    });

    const response = await POST(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toContain('Unknown extraction error');
  });

  it('returns 400 when file is empty (size 0)', async () => {
    const request = createRequestWithFile({
      name: 'empty.txt',
      type: 'text/plain',
      size: 0,
      content: '',
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Uploaded file is empty');
  });
});
