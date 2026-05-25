export type UserRole = "admin" | "project_manager" | "reviewer" | "viewer";

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    "manage:users",
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
  reviewer: [
    "submit:rams",
    "review:rams",
    "generate:emails",
    "send:emails",
    "view:projects",
    "view:documents",
    "view:rams",
  ],
  viewer: ["view:projects", "view:documents", "view:rams"],
};

export function hasPermission(role: UserRole, permission: string) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
