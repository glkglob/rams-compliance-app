import { createServerSupabase } from "@/lib/db/supabase-server";
import { logger } from "@/lib/logging";

/**
 * Actions whose audit records are security-critical: a failure to persist them
 * is surfaced as an error to the caller so it can decide whether to abort.
 */
const CRITICAL_ACTIONS = new Set([
  'DELETE_ACCOUNT',
  'DELETE_PROJECT',
  'REMOVE_PROJECT_MEMBER',
  'MANUAL_OVERRIDE',
]);

/**
 * Persist an audit-log row.
 *
 * - **critical** actions (`CRITICAL_ACTIONS`): the function throws on failure
 *   so the caller can roll back or surface the problem.
 * - **best-effort** actions (everything else): failures are logged but
 *   swallowed so they never block the happy path.
 *
 * Callers can also override the classification with `options.critical`.
 */
export async function createAuditLog(
  action: string,
  entityType: string,
  entityId: string,
  options?: {
    userId?: string;
    details?: Record<string, unknown>;
    critical?: boolean;
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
    const isCritical = options?.critical ?? CRITICAL_ACTIONS.has(action);
    if (isCritical) {
      logger.error("CRITICAL audit log write failed", { error: String(error), action, entityType, entityId });
      throw new Error(`Critical audit log failed for ${action}: ${String(error)}`);
    }
    logger.warn("Best-effort audit log write failed", { error: String(error), action, entityType, entityId });
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
    logger.error("Failed to fetch audit logs", { error: String(error) });
    return [];
  }

  return data ?? [];
}
