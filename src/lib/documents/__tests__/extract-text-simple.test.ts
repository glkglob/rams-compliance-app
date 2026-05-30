import { describe, it, expect } from 'vitest';
import { extractText } from '@/lib/extractText';

// Basic unit tests for the focused extraction utility
// Note: Full PDF/Word binary tests would require fixture files.

describe('extractText (document upload utility)', () => {
  it('extracts plain text from TXT buffer', async () => {
    const buffer = Buffer.from('Hello world from a test document.\nSecond line here.');
    const text = await extractText(buffer, 'text/plain', 'test-document.txt');
    expect(text).toContain('Hello world from a test document');
  });

  it('throws on unsupported file types', async () => {
    const buffer = Buffer.from('fake image data');
    await expect(
      extractText(buffer, 'image/jpeg', 'photo.jpg')
    ).rejects.toThrow(/Unsupported file type/);
  });

  it('handles empty-ish text gracefully for supported types', async () => {
    const buffer = Buffer.from('');
    const text = await extractText(buffer, 'text/plain', 'empty.txt');
    expect(text).toBe('');
  });
});
