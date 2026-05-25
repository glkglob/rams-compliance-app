"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Copy,
  Mail,
  RefreshCw,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ReviewCheck {
  id: string;
  status: string;
  severity: string;
  explanation: string;
  rams_evidence: string | null;
}

interface Review {
  id: string;
  review_status: string;
  compliance_score: number | null;
  decision_explanation: string | null;
  email_generated: boolean;
  email_sent: boolean;
  review_checks: ReviewCheck[];
}

interface GeneratedEmail {
  id: string;
  subject: string;
  body: string;
  sent: boolean;
  sent_at: string | null;
  created_at: string;
}

interface RAMSDetail {
  id: string;
  project_id: string;
  subcontractor_name: string;
  subcontractor_email: string | null;
  trade_package: string | null;
  file_name: string;
  review_status: string;
  compliance_score: number | null;
  created_at: string;
  projects: { name: string; compliance_threshold: number };
  rams_reviews: Review[];
  generated_emails: GeneratedEmail[];
}

function DecisionIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle className="h-12 w-12 text-green-500" />;
  if (status === "rejected") return <XCircle className="h-12 w-12 text-destructive" />;
  return <AlertTriangle className="h-12 w-12 text-yellow-500" />;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge variant="success">Approved</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  if (status === "manual_review") return <Badge variant="warning">Manual Review Required</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function CheckIcon({ status }: { status: string }) {
  if (status === "compliant") return <CheckCircle className="h-5 w-5 text-green-500" />;
  if (status === "non_compliant") return <XCircle className="h-5 w-5 text-destructive" />;
  return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
}

export default function RAMSDetailPage() {
  const params = useParams<{ ramsId: string }>();
  const router = useRouter();
  const [rams, setRams] = useState<RAMSDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadRAMS = async () => {
    try {
      const response = await fetch(`/api/rams/${params.ramsId}`);
      if (response.ok) {
        const data = (await response.json()) as RAMSDetail;
        setRams(data);
      }
    } catch (error) {
      console.error("Error loading RAMS:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadRAMS(); }, [params.ramsId]);

  const handleReview = async () => {
    setReviewing(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/rams/${params.ramsId}/review`, { method: "POST" });
      if (response.ok) {
        await loadRAMS();
      } else {
        const data = (await response.json()) as { error?: string };
        setActionError(data.error ?? "Review failed");
      }
    } catch {
      setActionError("Review failed unexpectedly");
    } finally {
      setReviewing(false);
    }
  };

  const handleGenerateEmail = async () => {
    setGeneratingEmail(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/rams/${params.ramsId}/generate-email`, { method: "POST" });
      if (response.ok) {
        await loadRAMS();
      } else {
        const data = (await response.json()) as { error?: string };
        setActionError(data.error ?? "Email generation failed");
      }
    } catch {
      setActionError("Email generation failed unexpectedly");
    } finally {
      setGeneratingEmail(false);
    }
  };

  const handleSendEmail = async () => {
    setSendingEmail(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/rams/${params.ramsId}/send-email`, { method: "POST" });
      if (response.ok) {
        await loadRAMS();
      } else {
        const data = (await response.json()) as { error?: string };
        setActionError(data.error ?? "Failed to send email");
      }
    } catch {
      setActionError("Failed to send email unexpectedly");
    } finally {
      setSendingEmail(false);
    }
  };

  const handleCopyEmail = () => {
    const body = rams?.generated_emails?.[0]?.body;
    if (body) {
      void navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-b-primary" />
      </div>
    );
  }

  if (!rams) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold">RAMS not found</h1>
        <Button onClick={() => router.back()} className="mt-4">
          Go Back
        </Button>
      </div>
    );
  }

  const review = rams.rams_reviews?.[0];
  const email = rams.generated_emails?.[0];

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <Button variant="ghost" onClick={() => router.back()} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <DecisionIcon status={rams.review_status} />
            <div>
              <h1 className="text-2xl font-bold">RAMS Review</h1>
              <p className="text-muted-foreground">
                {rams.subcontractor_name} — {rams.file_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <StatusBadge status={rams.review_status} />
            {rams.compliance_score !== null && (
              <div className="text-center">
                <div className="text-2xl font-bold">{rams.compliance_score}%</div>
                <div className="text-sm text-muted-foreground">Score</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {actionError && (
        <div className="mb-4 rounded border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Submission Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Subcontractor</dt>
                    <dd className="font-medium">{rams.subcontractor_name}</dd>
                  </div>
                  {rams.subcontractor_email && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Email</dt>
                      <dd className="font-medium">{rams.subcontractor_email}</dd>
                    </div>
                  )}
                  {rams.trade_package && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Trade</dt>
                      <dd className="font-medium">{rams.trade_package}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">File</dt>
                    <dd className="max-w-[180px] truncate font-medium">{rams.file_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Submitted</dt>
                    <dd className="font-medium">
                      {new Date(rams.created_at).toLocaleString()}
                    </dd>
                  </div>
                  {review?.decision_explanation && (
                    <div>
                      <dt className="mb-1 text-muted-foreground">Decision</dt>
                      <dd className="text-sm">{review.decision_explanation}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rams.review_status === "pending" && (
                  <Button onClick={handleReview} disabled={reviewing} className="w-full">
                    {reviewing ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Reviewing…
                      </>
                    ) : (
                      "Start Review"
                    )}
                  </Button>
                )}

                {review && !email && (
                  <Button
                    onClick={handleGenerateEmail}
                    disabled={generatingEmail}
                    variant="outline"
                    className="w-full"
                  >
                    {generatingEmail ? "Generating…" : "Generate Email"}
                  </Button>
                )}

                {email && (
                  <>
                    <Button onClick={handleCopyEmail} variant="outline" className="w-full">
                      <Copy className="mr-2 h-4 w-4" />
                      {copied ? "Copied!" : "Copy Email"}
                    </Button>
                    {rams.subcontractor_email && (
                      <Button
                        onClick={handleSendEmail}
                        disabled={sendingEmail || email.sent}
                        className="w-full"
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        {email.sent ? "Email Sent" : sendingEmail ? "Sending…" : "Send Email"}
                      </Button>
                    )}
                  </>
                )}

                {!review && rams.review_status !== "pending" && rams.review_status !== "processing" && (
                  <p className="text-center text-sm text-muted-foreground">
                    Status: {rams.review_status}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="requirements">
          <Card>
            <CardHeader>
              <CardTitle>Requirement Checks</CardTitle>
            </CardHeader>
            <CardContent>
              {review?.review_checks?.length ? (
                <div className="space-y-4">
                  {review.review_checks.map((check) => (
                    <div key={check.id} className="rounded-lg border p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckIcon status={check.status} />
                          <span className="font-medium capitalize">
                            {check.status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <Badge
                          variant={
                            check.severity === "critical"
                              ? "destructive"
                              : check.severity === "major"
                              ? "warning"
                              : "secondary"
                          }
                        >
                          {check.severity}
                        </Badge>
                      </div>
                      <p className="mb-2 text-sm">{check.explanation}</p>
                      {check.rams_evidence && (
                        <div className="rounded bg-muted p-2 text-sm">
                          <span className="font-medium">Evidence: </span>
                          {check.rams_evidence}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  No review checks available. Run a review first.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle>Email Draft</CardTitle>
            </CardHeader>
            <CardContent>
              {email ? (
                <div className="space-y-4">
                  <div>
                    <p className="mb-1 text-sm font-medium">Subject</p>
                    <p className="rounded bg-muted p-2 text-sm">{email.subject}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-sm font-medium">Body</p>
                    <div className="whitespace-pre-wrap rounded bg-muted p-4 text-sm">
                      {email.body}
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Generated: {new Date(email.created_at).toLocaleString()}</span>
                    <span>{email.sent ? `Sent ${email.sent_at ? new Date(email.sent_at).toLocaleString() : ""}` : "Draft"}</span>
                  </div>
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  No email generated yet. Use the Overview tab to generate one after review.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
