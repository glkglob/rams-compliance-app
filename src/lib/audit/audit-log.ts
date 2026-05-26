import { createServerSupabase } from "@/lib/db/supabase-server";

export async function createAuditLog(
  action: string,
  entityType: string,
  entityId: string,
  options?: {
    userId?: string;
    details?: Record<string, unknown>;
  }
) {
  const supabase = await createServerSupabase();

  const { error } = await supabase.from("audit_logs").insert({
    user_id: options?.userId ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details: options?.details,
  });

  if (error) {
    console.error("Failed to create audit log:", error);
  }
}

export async function getAuditLogs(
  entityType?: string,
  entityId?: string,
  limit = 50
) {
  const supabase = await createServerSupabase();

  let query = supabase
    .from("audit_logs")
    .select("*, profiles:user_id (email, full_name, role)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (entityType) {
    query = query.eq("entity_type", entityType);
  }

  if (entityId) {
    query = query.eq("entity_id", entityId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch audit logs:", error);
    return [];
  }

  return data ?? [];
}
