import { describe, expect, it } from 'vitest';
import {
  buildAttachmentStoragePath,
  MAX_ATTACHMENT_SIZE,
  ATTACHMENT_ALLOWED_MIME_TYPES,
} from '@/lib/attachments/storage';

describe('buildAttachmentStoragePath', () => {
  it('builds the correct path', () => {
    const path = buildAttachmentStoragePath(
      'rams_submission',
      'parent-uuid',
      'attach-uuid',
      'safety-plan.pdf',
    );
    expect(path).toBe('rams_submission/parent-uuid/attach-uuid_safety-plan.pdf');
  });

  it('sanitises unsafe characters in the filename', () => {
    const path = buildAttachmentStoragePath('rams_submission', 'p', 'a', 'my file (1).pdf');
    expect(path).toMatch(/^rams_submission\/p\/a_my_file__1_.pdf$/);
  });

  it('truncates long filenames to 100 chars', () => {
    const longName = 'a'.repeat(200) + '.pdf';
    const path = buildAttachmentStoragePath('rams_submission', 'p', 'a', longName);
    const segment = path.split('/')[2]; // "attachId_filename"
    const filename = segment.split('_').slice(1).join('_');
    expect(filename.length).toBeLessThanOrEqual(100);
  });
});

describe('MAX_ATTACHMENT_SIZE', () => {
  it('is 25 MB', () => {
    expect(MAX_ATTACHMENT_SIZE).toBe(25 * 1024 * 1024);
  });
});

describe('ATTACHMENT_ALLOWED_MIME_TYPES', () => {
  it('includes common document types', () => {
    expect(ATTACHMENT_ALLOWED_MIME_TYPES).toContain('application/pdf');
    expect(ATTACHMENT_ALLOWED_MIME_TYPES).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('includes image types', () => {
    expect(ATTACHMENT_ALLOWED_MIME_TYPES).toContain('image/jpeg');
    expect(ATTACHMENT_ALLOWED_MIME_TYPES).toContain('image/png');
  });

  it('does not include arbitrary binary types', () => {
    expect(ATTACHMENT_ALLOWED_MIME_TYPES).not.toContain('application/octet-stream');
    expect(ATTACHMENT_ALLOWED_MIME_TYPES).not.toContain('application/zip');
  });
});
