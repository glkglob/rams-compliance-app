'use client';

import { useCallback, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Edit3,
  Quote,
  Shield,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReviewCheckWithEvidence {
  id: string;
  status: string;
  severity: string;
  explanation?: string | null;
  rams_evidence?: string | null;
  score?: number | null;
  confidence_score?: number | null;
  evidence_quote?: string | null;
  source_chunk_id?: string | null;
}

interface AiEvidencePanelProps {
  ramsId: string;
  checks: ReviewCheckWithEvidence[];
  /** Override roles: admin, principal_designer, principal_contractor, project_manager */
  canOverride: boolean;
  /** Called after a successful override so the parent can refresh data. */
  onCheckOverridden?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<string, React.ReactNode> = {
  compliant:            <CheckCircle  className="h-4 w-4 text-green-600" />,
  partially_compliant:  <AlertTriangle className="h-4 w-4 text-yellow-600" />,
  non_compliant:        <XCircle      className="h-4 w-4 text-destructive" />,
  not_applicable:       <Shield       className="h-4 w-4 text-muted-foreground" />,
  unclear:              <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
};

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ');
}

function confidenceLabel(score: number | null | undefined): string {
  if (score == null) return 'N/A';
  if (score >= 0.85) return 'High';
  if (score >= 0.65) return 'Medium';
  return 'Low';
}

function confidenceColour(score: number | null | undefined): string {
  if (score == null) return 'text-muted-foreground';
  if (score >= 0.85) return 'text-green-600';
  if (score >= 0.65) return 'text-yellow-600';
  return 'text-red-600';
}

function severityVariant(s: string): 'destructive' | 'secondary' {
  if (s === 'critical') return 'destructive';
  return 'secondary';
}

// ── Override form (inline) ────────────────────────────────────────────────────

const OVERRIDE_STATUSES = [
  'compliant',
  'partially_compliant',
  'non_compliant',
  'not_applicable',
  'unclear',
] as const;

function OverrideForm({
  ramsId,
  checkId,
  currentStatus,
  onDone,
  onCancel,
}: {
  ramsId: string;
  checkId: string;
  currentStatus: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [newStatus, setNewStatus] = useState(currentStatus);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.length < 5) {
      setError('Reason must be at least 5 characters');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/rams/${ramsId}/checks/${checkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reason }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Override failed');
      }

      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Override failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Edit3 className="h-3.5 w-3.5" />
        Override Check Decision
      </div>

      <div className="flex gap-2">
        <select
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value)}
          className="rounded border bg-background px-2 py-1 text-sm"
        >
          {OVERRIDE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for override (min 5 chars)…"
        className="w-full rounded border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
        rows={2}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || reason.length < 5}>
          {saving ? 'Saving…' : 'Confirm Override'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── Single check row ──────────────────────────────────────────────────────────

function CheckRow({
  ramsId,
  check,
  canOverride,
  onOverridden,
}: {
  ramsId: string;
  check: ReviewCheckWithEvidence;
  canOverride: boolean;
  onOverridden: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overriding, setOverriding] = useState(false);

  const hasEvidence = !!(check.evidence_quote || check.confidence_score != null);
  const isOverridden = check.explanation?.startsWith('[OVERRIDE');

  return (
    <div className="rounded-lg border transition-colors hover:bg-muted/20">
      {/* Summary row */}
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        {STATUS_ICON[check.status] ?? STATUS_ICON.unclear}

        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium capitalize">{statusLabel(check.status)}</span>
          {isOverridden && (
            <span className="ml-2 text-xs text-yellow-600">(overridden)</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={severityVariant(check.severity)} className="text-[10px]">
            {check.severity}
          </Badge>

          {check.confidence_score != null && (
            <span className={`text-xs font-medium ${confidenceColour(check.confidence_score)}`}>
              {confidenceLabel(check.confidence_score)}
            </span>
          )}

          {check.score != null && (
            <span className="min-w-[3ch] text-right text-sm font-semibold tabular-nums">
              {Math.round(check.score * 100)}%
            </span>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3">
          {/* Explanation */}
          {check.explanation && (
            <div className="text-sm text-muted-foreground">{check.explanation}</div>
          )}

          {/* AI RAMS Evidence */}
          {check.rams_evidence && (
            <div className="rounded-md bg-muted p-3 text-xs">
              <span className="font-medium text-muted-foreground">RAMS Evidence:</span>{' '}
              {check.rams_evidence}
            </div>
          )}

          {/* Vector-retrieved evidence quote */}
          {check.evidence_quote && (
            <div className="rounded-md border-l-2 border-blue-400 bg-blue-50 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-blue-700">
                <Quote className="h-3 w-3" />
                Retrieved Evidence (from RAMS text)
              </div>
              <p className="text-xs text-blue-900 leading-relaxed italic">
                &ldquo;{check.evidence_quote}&rdquo;
              </p>
              {check.confidence_score != null && (
                <div className="mt-2 text-[10px] text-blue-600">
                  Confidence: {(check.confidence_score * 100).toFixed(0)}%
                  {' · '}
                  {check.source_chunk_id ? `Chunk ${check.source_chunk_id.slice(0, 8)}…` : 'No chunk reference'}
                </div>
              )}
            </div>
          )}

          {/* No evidence fallback */}
          {!hasEvidence && !check.rams_evidence && (
            <p className="text-xs text-muted-foreground italic">
              No vector-retrieved evidence available for this check.
            </p>
          )}

          {/* Override button / form */}
          {canOverride && !overriding && (
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={(e) => {
                e.stopPropagation();
                setOverriding(true);
              }}
            >
              <Edit3 className="mr-1.5 h-3.5 w-3.5" />
              Override Decision
            </Button>
          )}

          {overriding && (
            <OverrideForm
              ramsId={ramsId}
              checkId={check.id}
              currentStatus={check.status}
              onDone={() => {
                setOverriding(false);
                onOverridden();
              }}
              onCancel={() => setOverriding(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function AiEvidencePanel({ ramsId, checks, canOverride, onCheckOverridden }: AiEvidencePanelProps) {
  const handleOverridden = useCallback(() => {
    onCheckOverridden?.();
  }, [onCheckOverridden]);

  if (!checks.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No compliance checks available. Run an AI analysis first.
        </CardContent>
      </Card>
    );
  }

  // Sort: non-compliant first, then partially, then unclear, then compliant
  const ORDER: Record<string, number> = {
    non_compliant: 0,
    partially_compliant: 1,
    unclear: 2,
    not_applicable: 3,
    compliant: 4,
  };
  const sorted = [...checks].sort(
    (a, b) => (ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5),
  );

  const withEvidence = checks.filter((c) => c.evidence_quote);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            AI Evidence &amp; Review ({checks.length} checks)
          </span>
          {withEvidence.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {withEvidence.length}/{checks.length} with retrieved evidence
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map((check) => (
          <CheckRow
            key={check.id}
            ramsId={ramsId}
            check={check}
            canOverride={canOverride}
            onOverridden={handleOverridden}
          />
        ))}
      </CardContent>
    </Card>
  );
}
