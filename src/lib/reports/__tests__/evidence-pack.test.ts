import { describe, expect, it, vi } from 'vitest';

// Mock @react-pdf/renderer so the test suite doesn't spawn a full PDF engine.
vi.mock('@react-pdf/renderer', () => ({
  Document:        ({ children }: { children: unknown }) => children,
  Page:            ({ children }: { children: unknown }) => children,
  View:            ({ children }: { children: unknown }) => children,
  Text:            ({ children }: { children: unknown }) => children,
  Font:            { register: vi.fn() },
  StyleSheet:      { create: (s: unknown) => s },
  renderToBuffer:  vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock')),
}));

import { generateEvidencePack, type EvidencePackData } from '@/lib/reports/evidence-pack';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseData: EvidencePackData = {
  rams: {
    id:                  'rams-1',
    subcontractor_name:  'Acme Scaffolding Ltd',
    file_name:           'rams-v2.pdf',
    compliance_score:    87,
    review_status:       'approved',
    decision_explanation: 'All critical CDM requirements met.',
    created_at:          '2026-05-01T10:00:00Z',
    projects: {
      name:                'High Street Refurb',
      compliance_threshold: 80,
    },
    rams_reviews: [
      {
        id:             'review-1',
        review_status:  'approved',
        compliance_score: 87,
        decision_explanation: 'All critical CDM requirements met.',
        created_at:     '2026-05-02T09:00:00Z',
        review_checks: [
          { status: 'compliant',     severity: 'critical', explanation: 'PPE policy documented', rams_evidence: 'Section 3.1', score: 1 },
          { status: 'non_compliant', severity: 'major',    explanation: 'No COSHH register',     rams_evidence: null,          score: 0 },
          { status: 'partial',       severity: 'minor',    explanation: 'Partial risk matrix',   rams_evidence: 'Appendix B',  score: 0.5 },
        ],
      },
    ],
  },
  attachments: [
    { id: 'a1', file_name: 'site-photo.jpg', file_size: 204800, mime_type: 'image/jpeg', created_at: '2026-05-01T11:00:00Z' },
    { id: 'a2', file_name: 'coshh.pdf',      file_size: 512000, mime_type: 'application/pdf', created_at: '2026-05-01T11:30:00Z' },
  ],
  auditLogs: [
    { action: 'REVIEW_RAMS',      entity_type: 'rams_submission', created_at: '2026-05-02T09:00:00Z', profiles: { full_name: 'Jane Smith', email: 'jane@example.com' } },
    { action: 'UPLOAD_ATTACHMENT', entity_type: 'rams_submission', created_at: '2026-05-01T11:00:00Z', profiles: null },
  ],
  generatedAt:  '01 Jun 2026, 12:00',
  generatedBy:  'Jane Smith',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generateEvidencePack', () => {
  it('returns a Buffer', async () => {
    const result = await generateEvidencePack(baseData);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('produces non-empty output', async () => {
    const result = await generateEvidencePack(baseData);
    expect(result.length).toBeGreaterThan(0);
  });

  it('resolves when there are no attachments', async () => {
    const data: EvidencePackData = { ...baseData, attachments: [] };
    await expect(generateEvidencePack(data)).resolves.not.toThrow();
  });

  it('resolves when there are no audit logs', async () => {
    const data: EvidencePackData = { ...baseData, auditLogs: [] };
    await expect(generateEvidencePack(data)).resolves.not.toThrow();
  });

  it('resolves when no review has been run', async () => {
    const data: EvidencePackData = {
      ...baseData,
      rams: { ...baseData.rams, rams_reviews: [] },
    };
    await expect(generateEvidencePack(data)).resolves.not.toThrow();
  });

  it('resolves when compliance_score is null', async () => {
    const data: EvidencePackData = {
      ...baseData,
      rams: { ...baseData.rams, compliance_score: null },
    };
    await expect(generateEvidencePack(data)).resolves.not.toThrow();
  });

  it('calls renderToBuffer exactly once', async () => {
    const { renderToBuffer } = await import('@react-pdf/renderer');
    vi.mocked(renderToBuffer).mockClear();
    await generateEvidencePack(baseData);
    expect(renderToBuffer).toHaveBeenCalledOnce();
  });
});
