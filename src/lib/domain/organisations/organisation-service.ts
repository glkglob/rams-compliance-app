import { createServerSupabase } from "@/lib/db/supabase-server";

/**
 * Basic Organisation service / repository helpers for the new tenancy root.
 */

export async function getOrCreateDefaultOrganisation() {
  const supabase = await createServerSupabase();

  const { data: existing } = await supabase
    .from("organisations")
    .select("*")
    .eq("slug", "default")
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("organisations")
    .insert({ name: "Default Organisation", slug: "default" })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create default organisation: ${error.message}`);
  return data;
}

export async function listOrganisationsForUser(userId: string) {
  const supabase = await createServerSupabase();

  // For now, return orgs that have projects the user is member of (simple).
  // A real impl would query organisation_members.
  const { data: memberships } = await supabase
    .from("project_members")
    .select("project:projects(organisation_id, organisations(*))")
    .eq("user_id", userId);

  const orgs = new Map<string, unknown>();
  for (const m of (memberships as Array<{ project?: { organisations?: { id?: string } } }> | null) ?? []) {
    const org = m?.project?.organisations;
    if (org?.id) orgs.set(org.id, org);
  }
  return Array.from(orgs.values());
}

export async function ensureProjectInOrganisation(projectId: string, organisationId?: string) {
  const supabase = await createServerSupabase();
  const orgId = organisationId ?? (await getOrCreateDefaultOrganisation()).id;

  const { error } = await supabase
    .from("projects")
    .update({ organisation_id: orgId })
    .eq("id", projectId);

  if (error) throw error;
  return orgId;
}
