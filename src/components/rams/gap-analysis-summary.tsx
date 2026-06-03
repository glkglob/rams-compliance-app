'use client';

import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface ReviewCheck {
  status: string;
  severity: string;
}

interface GapAnalysisSummaryProps {
  checks: ReviewCheck[] | null | undefined;
  complianceScore?: number | null;
}

export function GapAnalysisSummary({ checks, complianceScore }: GapAnalysisSummaryProps) {
  if (!checks || checks.length === 0) {
    return (
      <div className="rounded-lg border bg-green-50 p-6 text-center">
        <CheckCircle className="mx-auto mb-2 h-8 w-8 text-green-600" />
        <p className="font-semibold text-green-700">No gaps found</p>
        <p className="text-sm text-green-600 mt-1">This RAMS appears fully compliant.</p>
      </div>
    );
  }

  const total = checks.length;
  const compliant = checks.filter(c => c.status === 'compliant').length;
  const nonCompliant = total - compliant;

  const critical = checks.filter(c => c.severity === 'critical').length;
  const major = checks.filter(c => c.severity === 'major').length;
  const minor = checks.filter(c => c.severity === 'minor').length;

  const complianceRate = Math.round((compliant / total) * 100);

  return (
    <div className="rounded-xl border bg-card p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Gap Analysis Summary</h3>
          <p className="text-sm text-muted-foreground">AI gap analysis of {total} requirement checks (recommendations only — record human decision below)</p>
        </div>
        {complianceScore !== null && complianceScore !== undefined && (
          <div className="text-right">
            <div className="text-3xl font-bold tabular-nums">{complianceScore}%</div>
            <div className="text-xs text-muted-foreground">Overall Score</div>
          </div>
        )}
      </div>

      {/* Compliance Breakdown */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Compliance Rate</span>
          <span className="font-medium">{complianceRate}%</span>
        </div>
        <Progress value={complianceRate} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{compliant} Compliant</span>
          <span>{nonCompliant} Gaps</span>
        </div>
      </div>

      {/* Severity Breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-destructive">
            <XCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Critical</span>
          </div>
          <div className="text-2xl font-bold mt-1">{critical}</div>
        </div>

        <div className="rounded-lg border p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-yellow-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Major</span>
          </div>
          <div className="text-2xl font-bold mt-1">{major}</div>
        </div>

        <div className="rounded-lg border p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Minor</span>
          </div>
          <div className="text-2xl font-bold mt-1">{minor}</div>
        </div>
      </div>

      {nonCompliant > 0 && (
        <div className="text-xs text-muted-foreground pt-2 border-t">
          {nonCompliant} issue{nonCompliant > 1 ? 's' : ''} require attention
        </div>
      )}
    </div>
  );
}
