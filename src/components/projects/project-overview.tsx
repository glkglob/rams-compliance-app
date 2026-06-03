"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ProjectOverview({ project }: { project: Record<string, unknown> }) {
  const status = project.status as string;
  const clientName = project.client_name as string | undefined;
  const siteAddress = project.site_address as string | undefined;
  const createdAt = project.created_at as string;
  const complianceThreshold = project.compliance_threshold as number | undefined;
  const description = project.description as string | undefined;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Project Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge variant={status === "active" ? "success" : "secondary"}>
                  {status}
                </Badge>
              </dd>
            </div>
            {clientName && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Client</dt>
                <dd className="font-medium">{clientName}</dd>
              </div>
            )}
            {siteAddress && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Site Address</dt>
                <dd className="font-medium">{siteAddress}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Created</dt>
              <dd className="font-medium">
                {new Date(createdAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compliance Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Auto-Approval Threshold</dt>
              <dd className="font-medium">{complianceThreshold ?? 80}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Compliance Documents</dt>
              <dd className="font-medium">-</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">RAMS Submitted</dt>
              <dd className="font-medium">-</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {description && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{description}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
