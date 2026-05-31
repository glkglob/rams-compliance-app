/**
 * Evidence Pack PDF
 *
 * A comprehensive export document for a single RAMS submission containing:
 *   1. Cover — project, subcontractor, score, decision
 *   2. AI Review Summary — explanation + check breakdown
 *   3. Compliance Checks Table — per-requirement pass/fail detail
 *   4. Attachments Manifest — files linked to the submission
 *   5. Audit Trail — recent activity on this submission
 */

import React from 'react';
import { Document, Text, View } from '@react-pdf/renderer';

import {
  COLOURS,
  PdfBadge,
  PdfKV,
  PdfPage,
  PdfScoreBlock,
  PdfSection,
  PdfTable,
  renderToBuffer,
} from './pdf-renderer';

// ── Data shape ─────────────────────────────────────────────────────────────────

export interface EvidencePackReviewCheck {
  status: string;
  severity: string;
  explanation?: string | null;
  rams_evidence?: string | null;
  score?: number | null;
}

export interface EvidencePackReview {
  id: string;
  review_status: string;
  compliance_score?: number | null;
  decision_explanation?: string | null;
  created_at: string;
  review_checks?: EvidencePackReviewCheck[];
}

export interface EvidencePackAttachment {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface EvidencePackAuditEntry {
  action: string;
  entity_type: string;
  created_at: string;
  details?: Record<string, unknown> | null;
  profiles?: { email?: string | null; full_name?: string | null } | null;
}

export interface EvidencePackData {
  rams: {
    id: string;
    subcontractor_name: string;
    file_name: string;
    compliance_score: number | null;
    review_status: string;
    decision_explanation: string | null;
    created_at: string;
    projects?: { name: string; compliance_threshold: number } | null;
    rams_reviews?: EvidencePackReview[];
  };
  attachments: EvidencePackAttachment[];
  auditLogs: EvidencePackAuditEntry[];
  generatedAt: string;
  generatedBy?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function countByStatus(checks: EvidencePackReviewCheck[], status: string): number {
  return checks.filter((c) => c.status.toLowerCase() === status.toLowerCase()).length;
}

// ── Cover block ────────────────────────────────────────────────────────────────

function CoverSection({ data }: { data: EvidencePackData }) {
  const { rams } = data;
  const review = rams.rams_reviews?.[0];
  const threshold = rams.projects?.compliance_threshold ?? 80;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: COLOURS.border,
        borderRadius: 6,
        padding: 20,
        marginBottom: 20,
        flexDirection: 'row',
        gap: 20,
      }}
    >
      {/* Score circle */}
      <View style={{ alignItems: 'center', justifyContent: 'center', width: 100 }}>
        <PdfScoreBlock
          score={rams.compliance_score}
          threshold={threshold}
        />
        {rams.compliance_score !== null && (
          <Text style={{ fontSize: 7.5, color: COLOURS.muted, marginTop: 4, textAlign: 'center' }}>
            Threshold: {threshold}%
          </Text>
        )}
      </View>

      {/* Details */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 10 }}>
          {rams.subcontractor_name}
        </Text>

        <PdfKV label="Project"         value={rams.projects?.name ?? '—'} />
        <PdfKV label="File"            value={rams.file_name} />
        <PdfKV label="Submitted"       value={fmtDate(rams.created_at)} />
        <PdfKV label="Review Status"   value={rams.review_status.replace(/_/g, ' ')} />
        {review && (
          <PdfKV label="Reviewed"      value={fmtDate(review.created_at)} />
        )}
        {data.generatedBy && (
          <PdfKV label="Exported by"   value={data.generatedBy} />
        )}

        <View style={{ marginTop: 8 }}>
          <PdfBadge status={rams.review_status} />
        </View>
      </View>
    </View>
  );
}

// ── Review summary block ───────────────────────────────────────────────────────

function ReviewSummarySection({ review }: { review: EvidencePackReview }) {
  const checks = review.review_checks ?? [];
  const passed   = countByStatus(checks, 'compliant');
  const failed   = countByStatus(checks, 'non_compliant');
  const partial  = countByStatus(checks, 'partial');
  const total    = checks.length;

  return (
    <PdfSection title="AI Review Summary">
      {review.decision_explanation && (
        <View
          style={{
            backgroundColor: COLOURS.bg,
            borderLeftWidth: 3,
            borderLeftColor: COLOURS.accent,
            padding: 8,
            marginBottom: 10,
            borderRadius: 2,
          }}
        >
          <Text style={{ fontSize: 8.5, lineHeight: 1.6 }}>
            {review.decision_explanation}
          </Text>
        </View>
      )}

      {/* Stats row */}
      {total > 0 && (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
          {[
            { label: 'Total Checks',  value: total,   colour: COLOURS.brand   },
            { label: 'Compliant',     value: passed,  colour: COLOURS.success },
            { label: 'Non-Compliant', value: failed,  colour: COLOURS.danger  },
            { label: 'Partial',       value: partial, colour: COLOURS.warning },
          ].map(({ label, value, colour }) => (
            <View
              key={label}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: COLOURS.border,
                borderRadius: 4,
                padding: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: colour }}>{value}</Text>
              <Text style={{ fontSize: 7, color: COLOURS.muted, marginTop: 2 }}>{label}</Text>
            </View>
          ))}
        </View>
      )}
    </PdfSection>
  );
}

// ── Compliance checks table ────────────────────────────────────────────────────

function ComplianceChecksSection({ checks }: { checks: EvidencePackReviewCheck[] }) {
  const rows = checks.map((c) => ({
    status:    c.status,
    severity:  c.severity,
    score:     c.score !== null && c.score !== undefined ? `${Math.round(c.score * 100)}%` : '—',
    explanation: c.explanation ?? '—',
    evidence:    c.rams_evidence ?? '—',
  })) as unknown as Record<string, unknown>[];

  return (
    <PdfSection title={`Compliance Checks (${checks.length})`}>
      <PdfTable
        columns={[
          {
            header: 'Status',
            width:  60,
            accessor: (r) => String((r as { status: string }).status).replace(/_/g, ' ').toUpperCase(),
          },
          {
            header: 'Sev.',
            width:  35,
            accessor: (r) => String((r as { severity: string }).severity).toUpperCase(),
          },
          {
            header: 'Score',
            width:  35,
            accessor: (r) => String((r as { score: string }).score),
          },
          {
            header: 'Explanation',
            width:  200,
            accessor: (r) => String((r as { explanation: string }).explanation).slice(0, 200),
          },
          {
            header: 'Evidence',
            width:  130,
            accessor: (r) => String((r as { evidence: string }).evidence).slice(0, 120),
          },
        ]}
        rows={rows}
      />
    </PdfSection>
  );
}

// ── Attachments manifest ───────────────────────────────────────────────────────

function AttachmentsSection({ attachments }: { attachments: EvidencePackAttachment[] }) {
  const rows = attachments.map((a) => ({
    name:    a.file_name,
    size:    formatBytes(a.file_size),
    type:    a.mime_type.split('/')[1]?.toUpperCase() ?? a.mime_type,
    uploaded: fmtDate(a.created_at),
  })) as unknown as Record<string, unknown>[];

  return (
    <PdfSection title={`Attachments (${attachments.length})`}>
      {attachments.length === 0 ? (
        <Text style={{ fontSize: 8.5, color: COLOURS.muted }}>No attachments.</Text>
      ) : (
        <PdfTable
          columns={[
            { header: 'File Name', width: 220, accessor: (r) => String((r as { name: string }).name) },
            { header: 'Type',      width: 55,  accessor: (r) => String((r as { type: string }).type) },
            { header: 'Size',      width: 55,  accessor: (r) => String((r as { size: string }).size) },
            { header: 'Uploaded',  width: 120, accessor: (r) => String((r as { uploaded: string }).uploaded) },
          ]}
          rows={rows}
        />
      )}
    </PdfSection>
  );
}

// ── Audit trail ────────────────────────────────────────────────────────────────

function AuditTrailSection({ logs }: { logs: EvidencePackAuditEntry[] }) {
  const rows = logs.map((l) => ({
    action: l.action.replace(/_/g, ' '),
    actor:  l.profiles?.full_name ?? l.profiles?.email ?? 'System',
    when:   fmtDate(l.created_at),
  })) as unknown as Record<string, unknown>[];

  return (
    <PdfSection title={`Audit Trail (last ${logs.length} events)`}>
      <PdfTable
        columns={[
          { header: 'Action', width: 180, accessor: (r) => String((r as { action: string }).action) },
          { header: 'Actor',  width: 140, accessor: (r) => String((r as { actor: string }).actor) },
          { header: 'When',   width: 140, accessor: (r) => String((r as { when: string }).when) },
        ]}
        rows={rows}
      />
    </PdfSection>
  );
}

// ── Document root ──────────────────────────────────────────────────────────────

function EvidencePackDocument({ data }: { data: EvidencePackData }) {
  const { rams } = data;
  const review = rams.rams_reviews?.[0];
  const docTitle = `Evidence Pack — ${rams.subcontractor_name}`;

  return (
    <Document
      title={docTitle}
      author="RAMS Compliance Review"
      subject="RAMS Evidence Pack"
      creator="RAMS Compliance Review"
    >
      <PdfPage docTitle="Evidence Pack" generatedAt={data.generatedAt}>
        {/* Cover */}
        <CoverSection data={data} />

        {/* Review summary (only if a review exists) */}
        {review && <ReviewSummarySection review={review} />}

        {/* Compliance checks */}
        {review?.review_checks && review.review_checks.length > 0 && (
          <ComplianceChecksSection checks={review.review_checks} />
        )}

        {/* Attachments */}
        <AttachmentsSection attachments={data.attachments} />

        {/* Audit trail */}
        {data.auditLogs.length > 0 && <AuditTrailSection logs={data.auditLogs} />}

        {/* No review state */}
        {!review && (
          <View
            style={{
              marginTop: 20,
              padding: 16,
              backgroundColor: COLOURS.bg,
              borderRadius: 4,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: COLOURS.muted, fontSize: 9 }}>
              No AI review has been run yet. Run an analysis to populate the compliance checks section.
            </Text>
          </View>
        )}
      </PdfPage>
    </Document>
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Render the evidence pack PDF and return a Node.js Buffer.
 * Runs entirely server-side; safe to call from API route handlers.
 */
export async function generateEvidencePack(data: EvidencePackData): Promise<Buffer> {
  const buffer = await renderToBuffer(<EvidencePackDocument data={data} />);
  return Buffer.from(buffer);
}
