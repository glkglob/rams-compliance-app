'use client';

import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ReviewCheck {
  id?: string;
  status: string;
  severity: string;
  explanation?: string | null;
  rams_evidence?: string | null;
  score?: number | null;
}

interface GapListProps {
  checks: ReviewCheck[] | null | undefined;
}

export function GapList({ checks }: GapListProps) {
  if (!checks || checks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-600" />
        <p className="font-medium">No gaps identified</p>
        <p className="text-sm text-muted-foreground mt-1">
          This RAMS appears compliant with the project requirements.
        </p>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    if (status === 'compliant') return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (status === 'non_compliant') return <XCircle className="h-4 w-4 text-destructive" />;
    return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
  };

  const getSeverityVariant = (severity: string) => {
    if (severity === 'critical') return 'destructive';
    if (severity === 'major') return 'warning';
    return 'secondary';
  };

  // Sort so non-compliant items appear first
  const sortedChecks = [...checks].sort((a, b) => {
    if (a.status === 'non_compliant' && b.status !== 'non_compliant') return -1;
    if (a.status !== 'non_compliant' && b.status === 'non_compliant') return 1;
    return 0;
  });

  return (
    <div className="space-y-3">
      {sortedChecks.map((check, index) => (
        <div
          key={check.id || index}
          className="rounded-lg border p-4 transition-colors hover:bg-muted/30"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {getStatusIcon(check.status)}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">
                    {check.status.replace('_', ' ')}
                  </span>
                  <Badge variant={getSeverityVariant(check.severity) as any}>
                    {check.severity}
                  </Badge>
                </div>

                {check.explanation && (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {check.explanation}
                  </p>
                )}

                {check.rams_evidence && (
                  <div className="mt-3 rounded-md bg-muted p-3 text-xs">
                    <span className="font-medium text-muted-foreground">Evidence:</span>{' '}
                    {check.rams_evidence}
                  </div>
                )}
              </div>
            </div>

            {check.score !== undefined && check.score !== null && (
              <div className="text-right tabular-nums">
                <div className="text-xs text-muted-foreground">Score</div>
                <div className="text-lg font-semibold">
                  {Math.round(check.score * 100)}%
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
