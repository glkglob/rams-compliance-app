"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, FileText, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RAMSSubmission {
  id: string;
  subcontractor_name: string;
  trade_package: string | null;
  file_name: string;
  review_status: string;
  compliance_score: number | null;
  created_at: string;
}

function statusBadge(status: string) {
  switch (status) {
    case "approved":
      return <Badge variant="success">Approved</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    case "manual_review":
      return <Badge variant="warning">Manual Review</Badge>;
    case "pending":
    case "processing":
      return <Badge variant="secondary">{status === "processing" ? "Processing" : "Pending"}</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function RAMSList({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<RAMSSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/projects/${projectId}/rams`);
        if (response.ok) {
          const data = (await response.json()) as RAMSSubmission[];
          setSubmissions(data);
        }
      } catch (error) {
        console.error("Error loading RAMS:", error);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-b-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>RAMS Submissions</CardTitle>
        <Button onClick={() => router.push(`/projects/${projectId}/rams/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          Submit RAMS
        </Button>
      </CardHeader>
      <CardContent>
        {submissions.length === 0 ? (
          <div className="py-8 text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No RAMS submissions yet.</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push(`/projects/${projectId}/rams/new`)}
            >
              Submit First RAMS
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((submission) => (
              <div
                key={submission.id}
                className="flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent"
                onClick={() => router.push(`/rams/${submission.id}`)}
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <FileText className="h-8 w-8 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate font-medium">
                      {submission.subcontractor_name}
                    </h4>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm text-muted-foreground">
                        {submission.file_name}
                      </span>
                      {submission.trade_package && (
                        <span className="rounded bg-muted px-2 py-0.5 text-xs">
                          {submission.trade_package}
                        </span>
                      )}
                      {statusBadge(submission.review_status)}
                      {submission.compliance_score !== null && (
                        <span className="text-sm font-medium">
                          {submission.compliance_score}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="shrink-0">
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
