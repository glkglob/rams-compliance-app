"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Force dynamic rendering — requires runtime auth + Supabase.
export const dynamic = 'force-dynamic';
import { Calendar, FolderOpen, MapPin, Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Project {
  id: string;
  name: string;
  client_name: string | null;
  site_address: string | null;
  compliance_threshold: number;
  created_at: string;
  status: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProjects() {
      try {
        const response = await fetch("/api/projects");

        if (response.status === 401) {
          router.push("/login");
          return;
        }

        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          setError(data.error ?? "Failed to load projects");
          return;
        }

        const data = (await response.json()) as Project[];
        setProjects(data);
      } catch (requestError) {
        console.error("Error loading projects:", requestError);
        setError("Unable to load projects right now.");
      } finally {
        setLoading(false);
      }
    }

    void loadProjects();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-b-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="mt-2 text-muted-foreground">
            View and manage the projects available to your account.
          </p>
        </div>
        <Button onClick={() => router.push("/projects/new")}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/30">
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {!error && projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="mb-2 text-xl font-semibold">No Projects Yet</h2>
            <p className="mb-4 max-w-md text-muted-foreground">
              Create your first project to get started with RAMS compliance
              review.
            </p>
            <Button onClick={() => router.push("/projects/new")}>
              Create Your First Project
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!error && projects.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer transition-shadow hover:shadow-lg"
              onClick={() => router.push(`/projects/${project.id}`)}
            >
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-3 text-xl">
                  <span className="truncate">{project.name}</span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      project.status === "active"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {project.status}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  {project.client_name ? (
                    <div className="flex items-center">
                      <Users className="mr-2 h-4 w-4" />
                      {project.client_name}
                    </div>
                  ) : null}
                  {project.site_address ? (
                    <div className="flex items-center">
                      <MapPin className="mr-2 h-4 w-4" />
                      {project.site_address}
                    </div>
                  ) : null}
                  <div className="flex items-center">
                    <Calendar className="mr-2 h-4 w-4" />
                    Created: {new Date(project.created_at).toLocaleDateString()}
                  </div>
                  <div className="mt-4 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <span>Compliance Threshold</span>
                      <span className="font-semibold text-foreground">
                        {project.compliance_threshold}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
