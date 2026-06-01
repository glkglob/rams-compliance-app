'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  RefreshCw, FileText, BarChart3, AlertTriangle, CheckCircle, Download,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReviewResults } from '@/components/rams/review-results';
import { GapList } from '@/components/rams/gap-list';
import { GapAnalysisSummary } from '@/components/rams/gap-analysis-summary';
import { AttachmentsTab } from '@/components/rams/attachments-tab';
import { AiEvidencePanel, type ReviewCheckWithEvidence } from '@/components/rams/ai-evidence-panel';
import { SubmissionHistory } from '@/components/rams/submission-history';

interface ReviewCheck {
  id?: string;
  status: string;
  severity: string;
  explanation?: string | null;
  rams_evidence?: string | null;
  score?: number | null;
  confidence_score?: number | null;
  evidence_quote?: string | null;
  source_chunk_id?: string | null;
}

interface RAMSData {
  id: string;
  subcontractor_name: string;
  file_name: string;
  extracted_text: string;
  review_status: string;
  compliance_score: number | null;
  decision_explanation: string | null;
  created_at: string;
  currentUserRole?: string | null;
  rams_reviews?: Array<{
    id: string;
    review_status: string;
    compliance_score?: number | null;
    decision_explanation?: string | null;
    email_generated?: boolean;
    email_sent?: boolean;
    review_checks?: ReviewCheck[];
  }>;
}

const OVERRIDE_ROLES = ['admin', 'principal_designer', 'principal_contractor', 'project_manager'];

export default function RAMSDetailPage() {
  const params = useParams<{ ramsId: string }>();
  const searchParams = useSearchParams(); // Add this import if not present
  const justUploaded = searchParams?.get('justUploaded') === 'true';

  const [rams, setRams] = useState<RAMSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRAMS = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rams/${params.ramsId}`);
      if (!res.ok) throw new Error('Failed to load RAMS');
      const data = await res.json();
      setRams(data);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load RAMS';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [params.ramsId]);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      void loadRAMS();
    }
  }, [loadRAMS]);

  const handleRunAnalysis = async () => {
    setReviewing(true);
    setError(null);

    try {
      const res = await fetch(`/api/rams/${params.ramsId}/review`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Review failed');
      }

      await loadRAMS(); // Refresh data
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
    } finally {
      setReviewing(false);
    }
  };

  async function handleDownloadEvidencePack() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/rams/${params.ramsId}/report?format=pdf`);
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RAMS-Evidence-Pack.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed';
      setError(message);
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" /> Loading RAMS...
        </div>
      </div>
    );
  }

  if (!rams) return <div className="p-8 text-center">RAMS not found</div>;

  const latestReview = rams.rams_reviews?.[0];
  const hasReview = !!latestReview;
  const canRunReview = rams.review_status === 'pending' || hasReview;

  return (
    <div className="container mx-auto max-w-6xl space-y-8 py-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{rams.subcontractor_name}</h1>
          <p className="text-muted-foreground">{rams.file_name}</p>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant={
            rams.review_status === 'approved' ? 'default' :
            rams.review_status === 'rejected' ? 'destructive' : 'secondary'
          }>
            {rams.review_status.replace('_', ' ')}
          </Badge>

          {rams.compliance_score !== null && (
            <div className="rounded-lg border px-4 py-1 text-center">
              <div className="text-2xl font-bold">{rams.compliance_score}%</div>
              <div className="text-xs text-muted-foreground">Compliance</div>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadEvidencePack}
            disabled={downloading}
            title="Download a PDF evidence pack with review results, attachments, and audit trail"
          >
            {downloading ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {downloading ? 'Generating…' : 'Evidence Pack'}
          </Button>
        </div>
      </div>

      {/* Post-upload guidance (P0 Discoverability) */}
      {justUploaded && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-5 w-5 text-green-600" />
            <div>
              <p className="font-semibold">RAMS uploaded successfully!</p>
              <p className="text-sm mt-1">
                Next step: Run AI-powered gap analysis to compare this RAMS against your project&apos;s compliance requirements.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Action */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">AI Compliance Analysis</h3>
              <p className="text-sm text-muted-foreground">
                {hasReview 
                  ? "Analysis complete. You can re-run if needed." 
                  : "Run AI analysis to detect gaps against project requirements."}
              </p>
            </div>

            <Button 
              onClick={handleRunAnalysis} 
              disabled={!canRunReview || reviewing}
              size="lg"
            >
              {reviewing ? (
                <>Analyzing... <RefreshCw className="ml-2 h-4 w-4 animate-spin" /></>
              ) : hasReview ? (
                <>Re-run AI Analysis</>
              ) : (
                <>Run AI Analysis</>
              )}
            </Button>
          </div>

          {error && (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Results Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="gaps">Gaps & Requirements</TabsTrigger>
          <TabsTrigger value="evidence">AI Evidence</TabsTrigger>
          <TabsTrigger value="extracted">Extracted Text</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="attachments">Attachments</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" /> Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {latestReview && latestReview.review_checks && (
                  <GapAnalysisSummary 
                    checks={latestReview.review_checks} 
                    complianceScore={rams.compliance_score} 
                  />
                )}

                {rams.decision_explanation && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">AI Summary</div>
                    <p className="text-sm">{rams.decision_explanation}</p>
                  </div>
                )}
                
                {latestReview && (
                  <ReviewResults review={latestReview} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Submission Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div><strong>Submitted by:</strong> {rams.subcontractor_name}</div>
                <div><strong>File:</strong> {rams.file_name}</div>
                <div><strong>Date:</strong> {new Date(rams.created_at).toLocaleDateString()}</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Gaps Tab */}
        <TabsContent value="gaps">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" /> Identified Gaps
              </CardTitle>
            </CardHeader>
            <CardContent>
              {latestReview ? (
                <GapList checks={latestReview.review_checks || []} />
              ) : (
                <p className="text-muted-foreground">Run AI Analysis to see gaps.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Evidence Tab */}
        <TabsContent value="evidence">
          {latestReview?.review_checks ? (
            <AiEvidencePanel
              ramsId={params.ramsId}
              checks={(latestReview.review_checks as ReviewCheckWithEvidence[]).filter(
                (c): c is ReviewCheckWithEvidence => !!c.id,
              )}
              canOverride={OVERRIDE_ROLES.includes(rams.currentUserRole ?? '')}
              onCheckOverridden={() => void loadRAMS()}
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Run AI Analysis to see evidence and compliance checks.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Extracted Text Tab */}
        <TabsContent value="extracted">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> Extracted Content
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[600px] overflow-auto rounded-md bg-muted p-4 text-sm whitespace-pre-wrap">
                {rams.extracted_text || "No extracted text available."}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <SubmissionHistory
            ramsId={params.ramsId}
            canResubmit={OVERRIDE_ROLES.includes(rams.currentUserRole ?? '')}
          />
        </TabsContent>

        {/* Attachments Tab */}
        <TabsContent value="attachments">
          <AttachmentsTab ramsId={params.ramsId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
