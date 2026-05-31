/**
 * Shared @react-pdf/renderer primitives for all PDF reports.
 *
 * This module owns:
 * - Brand colours and typography scale
 * - Page layout shell (PdfPage)
 * - Common structural components: PdfSection, PdfTable, PdfBadge
 *
 * All report documents import from here so visual consistency is maintained
 * in one place.
 */

import React from 'react';
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';

// ── Brand tokens ──────────────────────────────────────────────────────────────

export const COLOURS = {
  brand:       '#0f172a', // slate-900
  accent:      '#3b82f6', // blue-500
  success:     '#16a34a', // green-600
  warning:     '#d97706', // amber-600
  danger:      '#dc2626', // red-600
  muted:       '#64748b', // slate-500
  border:      '#e2e8f0', // slate-200
  bg:          '#f8fafc', // slate-50
  white:       '#ffffff',
  tableHeader: '#1e293b', // slate-800
  tableOdd:    '#f1f5f9', // slate-100
} as const;

// Use Helvetica (PDF built-in) so we need no font downloads.
Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'Helvetica' },
    { src: 'Helvetica-Bold', fontWeight: 'bold' },
    { src: 'Helvetica-Oblique', fontStyle: 'italic' },
  ],
});

// ── Global stylesheet ─────────────────────────────────────────────────────────

export const S = StyleSheet.create({
  // Page
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: COLOURS.brand,
    paddingTop: 48,
    paddingBottom: 52,
    paddingHorizontal: 40,
    lineHeight: 1.5,
  },

  // Header stripe across the top of every page
  pageHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 36,
    backgroundColor: COLOURS.brand,
    paddingHorizontal: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageHeaderTitle: {
    color: COLOURS.white,
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  pageHeaderDate: {
    color: '#94a3b8', // slate-400
    fontSize: 8,
  },

  // Footer
  pageFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 28,
    borderTopWidth: 1,
    borderTopColor: COLOURS.border,
    paddingHorizontal: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageFooterText: {
    fontSize: 7,
    color: COLOURS.muted,
  },

  // Section
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLOURS.brand,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLOURS.border,
  },

  // Key-value row
  kvRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  kvKey: {
    width: 140,
    fontWeight: 'bold',
    color: COLOURS.muted,
    fontSize: 8.5,
  },
  kvValue: {
    flex: 1,
    fontSize: 8.5,
  },

  // Table
  table: {
    width: '100%',
    marginTop: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLOURS.border,
    minHeight: 20,
    alignItems: 'center',
  },
  tableRowOdd: {
    backgroundColor: COLOURS.tableOdd,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: COLOURS.tableHeader,
    minHeight: 22,
    alignItems: 'center',
    borderRadius: 2,
  },
  tableHeaderCell: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    color: COLOURS.white,
    fontWeight: 'bold',
    fontSize: 8,
    letterSpacing: 0.3,
  },
  tableCell: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 8.5,
  },

  // Badge / status pill
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    alignSelf: 'flex-start',
    fontSize: 7.5,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
});

// ── Re-usable component props ─────────────────────────────────────────────────

export interface PdfPageProps {
  docTitle: string;
  generatedAt: string;
  pageIndex?: number;
  children: React.ReactNode;
}

/**
 * Base page wrapper: dark header stripe, footer with page number + generation date.
 */
export function PdfPage({ docTitle, generatedAt, children }: PdfPageProps) {
  return (
    <Page size="A4" style={S.page}>
      {/* Header stripe */}
      <View style={S.pageHeader} fixed>
        <Text style={S.pageHeaderTitle}>RAMS COMPLIANCE — {docTitle.toUpperCase()}</Text>
        <Text style={S.pageHeaderDate}>{generatedAt}</Text>
      </View>

      {/* Body content */}
      <View style={{ marginTop: 4 }}>{children}</View>

      {/* Footer */}
      <View style={S.pageFooter} fixed>
        <Text style={S.pageFooterText}>CONFIDENTIAL — For authorised use only</Text>
        <Text
          style={S.pageFooterText}
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
        />
      </View>
    </Page>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export function PdfSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ── Key-value list ────────────────────────────────────────────────────────────

export function PdfKV({ label, value }: { label: string; value: string }) {
  return (
    <View style={S.kvRow}>
      <Text style={S.kvKey}>{label}</Text>
      <Text style={S.kvValue}>{value}</Text>
    </View>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

export interface PdfTableColumn {
  header: string;
  width: number | string; // flex width or fixed pt
  accessor: (row: Record<string, unknown>, index: number) => string;
}

export function PdfTable({
  columns,
  rows,
}: {
  columns: PdfTableColumn[];
  rows: Record<string, unknown>[];
}) {
  return (
    <View style={S.table}>
      {/* Header */}
      <View style={S.tableHeaderRow}>
        {columns.map((col) => (
          <Text
            key={col.header}
            style={{ ...S.tableHeaderCell, width: col.width }}
          >
            {col.header}
          </Text>
        ))}
      </View>

      {/* Rows */}
      {rows.map((row, i) => (
        <View
          key={i}
          style={i % 2 === 1 ? { ...S.tableRow, ...S.tableRowOdd } : S.tableRow}
          wrap={false}
        >
          {columns.map((col) => (
            <Text
              key={col.header}
              style={{ ...S.tableCell, width: col.width }}
            >
              {col.accessor(row, i)}
            </Text>
          ))}
        </View>
      ))}

      {rows.length === 0 && (
        <View style={{ ...S.tableRow, paddingVertical: 8 }}>
          <Text style={{ ...S.tableCell, color: COLOURS.muted }}>No records.</Text>
        </View>
      )}
    </View>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, { bg: string; fg: string }> = {
  approved:      { bg: '#dcfce7', fg: COLOURS.success },
  compliant:     { bg: '#dcfce7', fg: COLOURS.success },
  pass:          { bg: '#dcfce7', fg: COLOURS.success },
  rejected:      { bg: '#fee2e2', fg: COLOURS.danger },
  non_compliant: { bg: '#fee2e2', fg: COLOURS.danger },
  fail:          { bg: '#fee2e2', fg: COLOURS.danger },
  manual_review: { bg: '#fef9c3', fg: COLOURS.warning },
  partial:       { bg: '#fef9c3', fg: COLOURS.warning },
  pending:       { bg: '#f1f5f9', fg: COLOURS.muted },
  processing:    { bg: '#eff6ff', fg: COLOURS.accent },
};

export function PdfBadge({ status }: { status: string }) {
  const colours = STATUS_COLOURS[status.toLowerCase()] ?? { bg: '#f1f5f9', fg: COLOURS.muted };
  return (
    <View style={{ ...S.badge, backgroundColor: colours.bg }}>
      <Text style={{ color: colours.fg }}>{status.replace(/_/g, ' ').toUpperCase()}</Text>
    </View>
  );
}

// ── Score circle (large compliance score display) ─────────────────────────────

export function PdfScoreBlock({
  score,
  threshold,
  label = 'Compliance Score',
}: {
  score: number | null;
  threshold?: number;
  label?: string;
}) {
  const pct = score ?? 0;
  const colour =
    score === null
      ? COLOURS.muted
      : pct >= (threshold ?? 80)
      ? COLOURS.success
      : pct >= 60
      ? COLOURS.warning
      : COLOURS.danger;

  return (
    <View
      style={{
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 6,
        borderColor: colour,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: 'bold', color: colour }}>
        {score !== null ? `${pct}%` : 'N/A'}
      </Text>
      <Text style={{ fontSize: 6.5, color: COLOURS.muted, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

// ── Barrel export: re-export @react-pdf/renderer primitives ──────────────────

export { Document, Page, Text, View, StyleSheet };
export { renderToBuffer } from '@react-pdf/renderer';
