"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Calendar, MapPin, User2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComplianceDocumentsTab } from "@/components/documents/compliance-documents-tab";
import { RAMSList } from "@/components/rams/rams-list";

interface Project {
  id: string;
  name: string;
  client_name: string | null;
  site_address: string | null;
  description: string | null;
  compliance_threshold: number;
  created_at: string;
  status: string;
}

export default function ProjectDetailsPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = useMemo(
    () =>
      Array.isArray(params.projectId) ? params.projectId[0] : params.projectId,
    [params.projectId]
  );
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProject() {
      try {
        const response = await fetch(`/api/projects/${projectId}`);

        if (response.status === 401) {
          router.push("/login");
          return;
        }

        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          setError(data.error ?? "Failed to load project");
          return;
        }

        const data = (await response.json()) as Project;
        setProject(data);
      } catch (requestError) {
        console.error("Error loading project:", requestError);
        setError("Unable to load project details right now.");
      } finally {
        setLoading(false);
      }
    }

    if (projectId) {
      void loadProject();
    }
  }, [projectId, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-b-primary" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="container mx-auto max-w-3xl p-6">
        <Button className="mb-6" variant="ghost" onClick={() => router.push("/projects")}>
          ← Back to Projects
        </Button>
        <Card className="border-destructive/30">
          <CardContent className="p-6 text-sm text-destructive">
            {error ?? "Project not found."}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <Button className="mb-6" variant="ghost" onClick={() => router.push("/projects")}>
        ← Back to Projects
      </Button>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                project.status === "active"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {project.status}
            </span>
          </div>
          <p className="max-w-3xl text-muted-foreground">
            {project.description ?? "No description provided yet."}
          </p>
        </div>
        <Button onClick={() => router.push("/projects/new")}>Create Another Project</Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="compliance-docs">Compliance Documents</TabsTrigger>
          <TabsTrigger value="rams">RAMS Submissions</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Client</CardTitle>
                <CardDescription>Primary client for this project.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <User2 className="h-4 w-4 text-muted-foreground" />
                <span>{project.client_name ?? "Not set"}</span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Site Address</CardTitle>
                <CardDescription>Project location.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{project.site_address ?? "Not set"}</span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Compliance Threshold</CardTitle>
                <CardDescription>Minimum score for auto-approval.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{project.compliance_threshold}%</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Created</CardTitle>
                <CardDescription>Initial project creation date.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{new Date(project.created_at).toLocaleDateString()}</span>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="compliance-docs">
          <ComplianceDocumentsTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="rams">
          <RAMSList projectId={projectId} />
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Project Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Settings panel coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
