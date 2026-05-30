'use client';

import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Review {
  id: string;
  review_status: string;
  compliance_score?: number | null;
  decision_explanation?: string | null;
  email_generated?: boolean;
  email_sent?: boolean;
}

interface ReviewResultsProps {
  review: Review | null | undefined;
}

export function ReviewResults({ review }: ReviewResultsProps) {
  if (!review) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No review has been completed yet.
      </div>
    );
  }

  const getStatusIcon = () => {
    switch (review.review_status) {
      case 'approved':
        return <CheckCircle className="h-6 w-6 text-green-600" />;
      case 'rejected':
        return <XCircle className="h-6 w-6 text-destructive" />;
      default:
        return <AlertTriangle className="h-6 w-6 text-yellow-600" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <div className="text-sm text-muted-foreground">Review Status</div>
            <div className="text-lg font-semibold capitalize">
              {review.review_status.replace('_', ' ')}
            </div>
          </div>
        </div>

        {review.compliance_score !== null && (
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Compliance Score</div>
            <div className="text-3xl font-bold tabular-nums">
              {review.compliance_score}%
            </div>
          </div>
        )}
      </div>

      {review.decision_explanation && (
        <div className="rounded-md border bg-muted/50 p-4 text-sm">
          <div className="mb-1 font-medium text-muted-foreground">AI Summary</div>
          <p>{review.decision_explanation}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant={review.email_generated ? 'default' : 'secondary'}>
          Email Draft {review.email_generated ? 'Generated' : 'Pending'}
        </Badge>
        <Badge variant={review.email_sent ? 'default' : 'secondary'}>
          Email {review.email_sent ? 'Sent' : 'Not Sent'}
        </Badge>
      </div>
    </div>
  );
}
