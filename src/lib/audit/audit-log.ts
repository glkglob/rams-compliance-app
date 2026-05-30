import { createServerSupabase } from "@/lib/db/supabase-server";
import { logger } from "@/lib/logging";

/**
 * Actions that represent highly sensitive, irreversible, or compliance-critical operations.
 * Failures to record these must be treated as serious incidents (not silently swallowed).
 *
 * IMPORTANT: Keep this list in sync with actual strings passed to createAuditLog()
 * across the codebase (see rg "createAuditLog\(" results).
 */
const CRITICAL_ACTIONS = new Set<string>([
  // Account lifecycle (GDPR / right to erasure)
  'SOFT_DELETE_ACCOUNT',
  'HARD_DELETE_ACCOUNT',

  // Manual override of automated AI compliance decisions
  'OVERRIDE_RAMS_REVIEW',

  // Destructive / high-privilege operations
  'DELETE_PROJECT',
  'DELETE_COMPLIANCE_DOCUMENT',
  'REMOVE_PROJECT_MEMBER',
]);

export function isCriticalAuditAction(action: string): boolean {
  return CRITICAL_ACTIONS.has(action);
}

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
    const isCritical = CRITICAL_ACTIONS.has(action);

    logger.error(
      isCritical ? `CRITICAL AUDIT LOG FAILURE: ${action}` : 'Failed to create audit log',
      {
        error: String(error),
        action,
        entityType,
        entityId,
        isCritical,
      }
    );

    // For critical actions we must not silently swallow the failure.
    // Throwing makes the sensitive operation visibly fail (or surface in the caller's error handler)
    // rather than completing an unaudited destructive/override action.
    if (isCritical) {
      throw new Error(`Failed to record critical audit log for action "${action}"`);
    }
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
