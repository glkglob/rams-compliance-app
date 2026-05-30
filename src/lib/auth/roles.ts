// CDM 2015 (Construction Design and Management Regulations 2015) dutyholder roles
// are the primary role types for this application. Legacy roles (project_manager,
// user) are retained in the union so existing DB rows remain type-safe.
export type UserRole =
  | "admin"
  | "client"
  | "principal_designer"
  | "principal_contractor"
  | "designer"
  | "contractor"
  | "reviewer"
  | "viewer"
  // Legacy — still stored in production; preserved for backward compat.
  | "project_manager"
  | "user";

/** Human-readable labels used in the UI (settings, project members, audit log). */
export const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  admin: "Administrator",
  client: "Client",
  principal_designer: "Principal Designer",
  principal_contractor: "Principal Contractor",
  designer: "Designer",
  contractor: "Contractor",
  reviewer: "Reviewer",
  viewer: "Viewer",
  // Legacy
  project_manager: "Project Manager",
  user: "User",
};

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    "manage:users",
    "create:projects",
    "manage:projects",
    "manage:documents",
    "manage:thresholds",
    "manage:overrides",
    "upload:compliance_docs",
    "upload:rams",
    "submit:rams",
    "review:rams",
    "generate:emails",
    "send:emails",
    "view:projects",
    "view:documents",
    "view:rams",
  ],

  // CDM 2015: commissions the project; has oversight but not technical execution rights.
  client: [
    "create:projects",
    "manage:projects",
    "upload:compliance_docs",
    "view:projects",
    "view:documents",
    "view:rams",
  ],

  // CDM 2015: coordinates pre-construction health and safety; reviews RAMS and can override.
  principal_designer: [
    "create:projects",
    "manage:projects",
    "manage:documents",
    "upload:compliance_docs",
    "review:rams",
    "manage:overrides",
    "generate:emails",
    "send:emails",
    "view:projects",
    "view:documents",
    "view:rams",
  ],

  // CDM 2015: plans and manages the construction phase; responsible for RAMS compliance.
  principal_contractor: [
    "create:projects",
    "manage:projects",
    "manage:documents",
    "upload:rams",
    "submit:rams",
    "review:rams",
    "manage:overrides",
    "generate:emails",
    "send:emails",
    "view:projects",
    "view:documents",
    "view:rams",
  ],

  // CDM 2015: contributes to the structural/architectural design.
  designer: [
    "upload:compliance_docs",
    "submit:rams",
    "view:projects",
    "view:documents",
    "view:rams",
  ],

  // CDM 2015: carries out construction work; submits RAMS for review.
  contractor: [
    "upload:rams",
    "submit:rams",
    "view:projects",
    "view:documents",
    "view:rams",
  ],

  reviewer: [
    "submit:rams",
    "review:rams",
    "generate:emails",
    "send:emails",
    "view:projects",
    "view:documents",
    "view:rams",
  ],

  viewer: [
    "create:projects",
    "view:projects",
    "view:documents",
    "view:rams",
    "submit:rams",
  ],

  // Legacy roles — permissions preserved as-is for backward compatibility.
  project_manager: [
    "create:projects",
    "manage:projects",
    "manage:documents",
    "upload:compliance_docs",
    "submit:rams",
    "review:rams",
    "generate:emails",
    "send:emails",
    "view:projects",
    "view:documents",
    "view:rams",
  ],
  user: [
    "create:projects",
    "view:projects",
    "view:documents",
    "view:rams",
    "submit:rams",
  ],
};

export function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Roles that may perform a manual RAMS override.
 * Includes CDM duty holders with management responsibility and the legacy
 * project_manager role for backward compat.
 */
export const OVERRIDE_ALLOWED_ROLES: readonly UserRole[] = [
  "admin",
  "principal_designer",
  "principal_contractor",
  "project_manager", // legacy
] as const;
