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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComplianceDocumentsTab } from "@/components/documents/compliance-documents-tab";
import { RAMSList } from "@/components/rams/rams-list";
import { createClient } from "@/lib/db/supabase-client";

interface Project {
  id: string;
  name: string;
  client_name: string | null;
  site_address: string | null;
  description: string | null;
  compliance_threshold: number;
  created_at: string;
  status: string;
  currentUserRole?: string | null;
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

  // Threshold editing state (Settings tab)
  const [thresholdInput, setThresholdInput] = useState(80);
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);

  const canEditThreshold = project?.currentUserRole === "admin" || project?.currentUserRole === "project_manager";

  // Project members (for Settings tab)
  const [members, setMembers] = useState<Array<{ id: string; role: string; profiles: { full_name: string | null; email: string | null } | null }>>([]);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [updatingRoleMemberId, setUpdatingRoleMemberId] = useState<string | null>(null);

  // Recent Activity (for Settings tab)
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // Invite member state (Settings tab)
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "reviewer" | "project_manager">("viewer");
  const [isInviting, setIsInviting] = useState(false);

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
        setThresholdInput(data.compliance_threshold);

        // Load members for settings
        const supabase = createClient();
        const { data: memberData } = await supabase
          .from("project_members")
          .select(`
            id,
            role,
            profiles (
              full_name,
              email
            )
          `)
          .eq("project_id", projectId)
          .order("created_at", { ascending: true });

        if (memberData) {
          setMembers(memberData as any);
        }

        // Load recent activity (audit logs) - especially threshold changes
        const { data: auditData } = await supabase
          .from("audit_logs")
          .select("action, details, created_at")
          .eq("entity_type", "project")
          .eq("entity_id", projectId)
          .in("action", ["UPDATE_PROJECT", "UPDATE_PROJECT_THRESHOLD", "CREATE_PROJECT"])
          .order("created_at", { ascending: false })
          .limit(8);

        if (auditData) setRecentActivity(auditData);
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

  async function handleSaveThreshold() {
    if (!project) return;

    setIsSavingThreshold(true);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complianceThreshold: thresholdInput }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update threshold");
      }

      const updated = await response.json();
      setProject(updated);
      // Keep the input in sync
      setThresholdInput(updated.compliance_threshold);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to save threshold");
    } finally {
      setIsSavingThreshold(false);
    }
  }

  async function handleRemoveMember(memberId: string, memberEmail: string) {
    if (!confirm(`Remove ${memberEmail} from this project?`)) return;

    setRemovingMemberId(memberId);
    try {
      const response = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove member");
      }

      // Refresh members list
      const supabase = createClient();
      const { data: memberData } = await supabase
        .from("project_members")
        .select(`id, role, profiles (full_name, email)`)
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (memberData) setMembers(memberData as any);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleChangeMemberRole(memberId: string, newRole: string) {
    setUpdatingRoleMemberId(memberId);
    try {
      const response = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update role");
      }

      // Refresh members
      const supabase = createClient();
      const { data: memberData } = await supabase
        .from("project_members")
        .select(`id, role, profiles (full_name, email)`)
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (memberData) setMembers(memberData as any);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setUpdatingRoleMemberId(null);
    }
  }

  async function handleInviteMember() {
    if (!inviteEmail) return;

    setIsInviting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to invite member");
      }

      // Reset form and refresh members
      setInviteEmail("");
      setInviteRole("viewer");

      const supabase = createClient();
      const { data: memberData } = await supabase
        .from("project_members")
        .select(`id, role, profiles (full_name, email)`)
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (memberData) setMembers(memberData as any);

      alert("Member invited successfully!");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to invite member");
    } finally {
      setIsInviting(false);
    }
  }

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

          {/* Recent Activity on Overview */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <CardDescription>Latest updates on this project.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {recentActivity.slice(0, 5).map((log, index) => (
                    <div key={index} className="flex justify-between border-b pb-1 last:border-0">
                      <span className="capitalize">
                        {log.action.toLowerCase().replace(/_/g, " ")}
                        {log.details?.newThreshold && ` → ${log.details.newThreshold}%`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No recent activity yet.</p>
              )}
            </CardContent>
          </Card>
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
              <CardDescription>
                Configure project-level compliance settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-2">Compliance Threshold</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Documents scoring below this percentage will be flagged for review.
                </p>

                <div className="flex items-end gap-4">
                  <div>
                    <Label htmlFor="threshold" className="sr-only">
                      Compliance Threshold
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="threshold"
                        type="number"
                        min={0}
                        max={100}
                        value={thresholdInput}
                        onChange={(e) => setThresholdInput(Number(e.target.value))}
                        className="w-24 text-2xl font-semibold"
                        disabled={!canEditThreshold}
                      />
                      <span className="text-2xl font-semibold">%</span>
                    </div>
                  </div>

                  {canEditThreshold && (
                    <Button
                      onClick={handleSaveThreshold}
                      disabled={isSavingThreshold || thresholdInput === project.compliance_threshold}
                    >
                      {isSavingThreshold ? "Saving..." : "Save Threshold"}
                    </Button>
                  )}
                </div>

                <p className="text-xs text-muted-foreground mt-2">
                  Current: <span className="font-medium">{project.compliance_threshold}%</span>
                  {!canEditThreshold && " (view only)"}
                </p>
              </div>

              {/* Project Members */}
              <div>
                <h3 className="text-sm font-medium mb-3">Team Members</h3>
                {members.length > 0 ? (
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                      >
                        <div>
                          <div className="font-medium">
                            {member.profiles?.full_name || "Unnamed user"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {member.profiles?.email}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {canEditThreshold && member.role !== "admin" ? (
                            <select
                              value={member.role}
                              onChange={(e) => handleChangeMemberRole(member.id, e.target.value)}
                              disabled={updatingRoleMemberId === member.id}
                              className="rounded border bg-background px-2 py-0.5 text-xs capitalize"
                            >
                              <option value="viewer">viewer</option>
                              <option value="reviewer">reviewer</option>
                              <option value="project_manager">project_manager</option>
                            </select>
                          ) : (
                            <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium capitalize">
                              {member.role}
                            </span>
                          )}
                          {canEditThreshold && member.role !== "admin" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveMember(member.id, member.profiles?.email || "")}
                              disabled={removingMemberId === member.id}
                            >
                              {removingMemberId === member.id ? "..." : "Remove"}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No members found.</p>
                )}

                {canEditThreshold && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Use the role selector above to change member roles.
                  </p>
                )}

                {/* Invite new member */}
                {canEditThreshold && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium mb-2">Invite by Email</h4>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="colleague@company.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="flex-1"
                      />
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as any)}
                        className="rounded border bg-background px-2 text-sm"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="reviewer">Reviewer</option>
                        <option value="project_manager">Project Manager</option>
                      </select>
                      <Button
                        onClick={handleInviteMember}
                        disabled={isInviting || !inviteEmail}
                      >
                        {isInviting ? "Inviting..." : "Invite"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      User must already have an account on the platform.
                    </p>
                  </div>
                )}
              </div>

              {/* Recent Activity */}
              <div>
                <h3 className="text-sm font-medium mb-3">Recent Activity</h3>
                {recentActivity.length > 0 ? (
                  <div className="space-y-2 text-sm">
                    {recentActivity.map((log, index) => (
                      <div key={index} className="flex justify-between border-b pb-1 last:border-0">
                        <span>
                          {log.action.replace(/_/g, " ")}
                          {log.details?.newThreshold && ` → ${log.details.newThreshold}%`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No recent activity.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
