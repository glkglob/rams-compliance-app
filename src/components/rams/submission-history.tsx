'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, FileText, GitBranch, Upload } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// ── Types ─────────────────────────────────────────────────────────────────────

interface VersionEntry {
  id: string;
  version_number: number;
  file_name: string;
  review_status: string;
  compliance_score: number | null;
  created_at: string;
  subcontractor_name: string;
  parent_submission_id: string | null;
}

interface VersionsResponse {
  rootId: string;
  currentId: string;
  versions: VersionEntry[];
}

interface SubmissionHistoryProps {
  ramsId: string;
  /** When true, shows "Resubmit" button for uploading a new version. */
  canResubmit: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case 'approved':
      return <Badge variant="default">Approved</Badge>;
    case 'rejected':
      return <Badge variant="destructive">Rejected</Badge>;
    case 'manual_review':
      return <Badge variant="secondary">Manual Review</Badge>;
    case 'pending':
    case 'processing':
      return <Badge variant="secondary">{status === 'processing' ? 'Processing' : 'Pending'}</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SubmissionHistory({ ramsId, canResubmit }: SubmissionHistoryProps) {
  const router = useRouter();
  const [data, setData] = useState<VersionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/rams/${ramsId}/versions`);
      if (res.ok) {
        setData(await res.json() as VersionsResponse);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, [ramsId]);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      void loadVersions();
    }
  }, [loadVersions]);

  async function handleResubmit(file: File) {
    setUploading(true);
    setUploadError(null);

    const body = new FormData();
    body.append('file', file);

    try {
      const res = await fetch(`/api/rams/${ramsId}/resubmit`, {
        method: 'POST',
        body,
      });
      const result = await res.json() as { id?: string; error?: string };

      if (!res.ok) {
        setUploadError(result.error ?? 'Resubmission failed');
        return;
      }

      // Navigate to the new version
      if (result.id) {
        router.push(`/rams/${result.id}?justUploaded=true`);
      } else {
        void loadVersions();
      }
    } catch {
      setUploadError('Network error — please try again');
    } finally {
      setUploading(false);
    }
  }

  const versions = data?.versions ?? [];
  const isOnlyVersion = versions.length <= 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Submission History
        </CardTitle>
        <CardDescription>
          {isOnlyVersion
            ? 'This is the only version. Resubmit to create a new version.'
            : `${versions.length} versions in this submission chain.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Resubmit button */}
        {canResubmit && (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Clock className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {uploading ? 'Uploading…' : 'Resubmit New Version'}
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.pptx,.txt,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleResubmit(f);
                e.target.value = '';
              }}
            />

            {uploadError && (
              <p className="mt-2 text-xs text-destructive">{uploadError}</p>
            )}
          </div>
        )}

        {/* Version timeline */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No version history available.</p>
        ) : (
          <div className="relative space-y-0 pl-6">
            {/* Timeline line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

            {versions.map((v, i) => {
              const isCurrent = v.id === ramsId;
              const isLatest = i === versions.length - 1;

              return (
                <div
                  key={v.id}
                  className={[
                    'relative flex items-start gap-3 rounded-md px-3 py-3 transition-colors',
                    isCurrent ? 'bg-muted/50' : 'hover:bg-muted/30 cursor-pointer',
                  ].join(' ')}
                  onClick={isCurrent ? undefined : () => router.push(`/rams/${v.id}`)}
                  role={isCurrent ? undefined : 'link'}
                >
                  {/* Timeline dot */}
                  <div
                    className={[
                      'absolute -left-3 top-4 h-2.5 w-2.5 rounded-full border-2',
                      isCurrent
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/40 bg-background',
                    ].join(' ')}
                  />

                  {/* Icon */}
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        v{v.version_number}
                      </span>
                      {isCurrent && (
                        <Badge variant="outline" className="text-[10px]">Current</Badge>
                      )}
                      {isLatest && !isCurrent && (
                        <Badge variant="outline" className="text-[10px]">Latest</Badge>
                      )}
                      {statusBadge(v.review_status)}
                      {v.compliance_score !== null && (
                        <span className="text-xs font-medium tabular-nums">
                          {v.compliance_score}%
                        </span>
                      )}
                    </div>

                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {v.file_name} · {fmtDate(v.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
