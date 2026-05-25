import { describe, it, expect } from 'vitest';
import { validateFile, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../file-validation';

describe('File Validation', () => {
  it('should accept valid PDF files', () => {
    const result = validateFile('document.pdf', 'application/pdf', 1000000);
    expect(result.isSupported).toBe(true);
    expect(result.normalisedFileType).toBe('pdf');
    expect(result.issues).toHaveLength(0);
  });

  it('should accept valid DOCX files', () => {
    const result = validateFile(
      'document.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      500000
    );
    expect(result.isSupported).toBe(true);
    expect(result.normalisedFileType).toBe('docx');
  });

  it('should accept image files and mark for OCR', () => {
    const result = validateFile('photo.jpg', 'image/jpeg', 2000000);
    expect(result.isSupported).toBe(true);
    expect(result.requiresOcr).toBe(true);
  });

  it('should reject unsupported file extensions', () => {
    const result = validateFile('script.exe', 'application/x-msdownload', 1000);
    expect(result.isSupported).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('should reject files exceeding size limit', () => {
    const result = validateFile('large.pdf', 'application/pdf', MAX_FILE_SIZE + 1);
    expect(result.isSupported).toBe(false);
    expect(result.issues.some(i => i.includes('size'))).toBe(true);
  });

  it('should handle edge cases with missing extensions', () => {
    const result = validateFile('noextension', 'application/pdf', 1000);
    expect(result.isSupported).toBe(false);
  });

  it('should validate all supported MIME types', () => {
    Object.entries(ALLOWED_MIME_TYPES).forEach(([mimeType, ext]) => {
      const result = validateFile(`test.${ext}`, mimeType, 1000);
      expect(result.isSupported).toBe(true);
    });
  });
});
