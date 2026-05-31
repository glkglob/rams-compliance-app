# Role-check audit

_Last updated: 2026-05-31_

## What this document covers

This document records the role-check audit performed as part of Phase 0.2.
It describes every place in the codebase where a user's role is inspected,
categorises the pattern used, and explains the fixes applied to align the UI
with what the API actually enforces.

---

## Approved patterns

All role checks in production code must use one of these helpers.
Raw string literals (`=== "admin"`, `!== "project_manager"`, …) are banned
outside of `src/lib/auth/roles.ts`.

| Helper | Location | Use when |
|--------|----------|----------|
| `isAdminRole(role)` | `@/lib/auth/roles` | Checking the platform admin role in API routes that branch on admin vs. scoped access |
| `isProjectManagementRole(role)` | `@/lib/auth/roles` | Checking whether a role can manage/edit project settings (UI and API) |
| `hasPermission(role, permission)` | `@/lib/auth/roles` | Fine-grained permission checks using the `ROLE_PERMISSIONS` table |
| `canManageProject(projectId)` | `@/lib/auth/permissions` | RPC-backed project-scope management gate (preferred for project mutation routes) |
| `canViewProject(projectId)` | `@/lib/auth/permissions` | RPC-backed project-scope view gate |
| `OVERRIDE_ALLOWED_ROLES.includes(role)` | `@/lib/auth/roles` | RAMS manual override gate |

Run `npx tsx scripts/audit-roles.ts` at any time to verify compliance.

---

## Role constants

Defined in `src/lib/auth/roles.ts`.

### `PROJECT_MANAGEMENT_ROLES`
Roles that can manage a project (edit settings, invite/remove members, etc.):

```
admin, client, principal_designer, principal_contractor, project_manager (legacy)
```

### `PROJECT_REVIEW_ROLES`
Roles that can review RAMS outcomes:

```
admin, principal_designer, principal_contractor, reviewer, project_manager (legacy)
```

### `PROJECT_ASSIGNABLE_ROLES`
Roles that can be assigned to new members via the UI:

```
client, principal_designer, principal_contractor, designer, contractor, reviewer, viewer
```
> Legacy `project_manager` is intentionally excluded from new assignments to avoid
> introducing new legacy-role rows. Existing rows with that role are still supported.

### `OVERRIDE_ALLOWED_ROLES`
Roles permitted to submit a manual RAMS override:

```
admin, principal_designer, principal_contractor, project_manager (legacy)
```

---

## Bugs found and fixed (2026-05-31)

### BUG-1 — UI `canEditThreshold` was too narrow (HIGH)

**File**: `src/app/projects/[projectId]/page.tsx`

**Before**:
```ts
const canEditThreshold =
  project?.currentUserRole === "admin" ||
  project?.currentUserRole === "project_manager";
```

**Problem**: The API gates project-settings mutations with `canManageProject()`, which
accepts `PROJECT_MANAGEMENT_ROLES`: `admin`, `client`, `principal_designer`,
`principal_contractor`, and legacy `project_manager`.  
The UI checked only `admin | project_manager`, so users with CDM roles
(`client`, `principal_designer`, `principal_contractor`) were locked out of the
settings panel even though every mutation they attempted would succeed on the API.

**Fix**:
```ts
const canEditThreshold = isProjectManagementRole(project?.currentUserRole);
```

---

### BUG-2 — Member role-change selector showed legacy roles only (MEDIUM)

**File**: `src/app/projects/[projectId]/page.tsx`

**Before**:
```tsx
<option value="viewer">viewer</option>
<option value="reviewer">reviewer</option>
<option value="project_manager">project_manager</option>
```

**Problem**: The invite and role-change selectors exposed only three options, one of
which (`project_manager`) is a legacy role the API no longer creates. CDM roles were
invisible in the UI, making it impossible to assign them from the project settings page.

**Fix**: Both selectors now iterate `PROJECT_ASSIGNABLE_ROLES` and display human-readable
labels from `ROLE_DISPLAY_NAMES`.

---

### BUG-3 — Member remove/edit guard used wrong condition (MEDIUM)

**File**: `src/app/projects/[projectId]/page.tsx`

**Before**:
```tsx
{canEditThreshold && member.role !== "admin" && (...)
```

**Problem**: Prevented editing members whose role is `"admin"` but ignored the broader
set of management roles that should also be un-editable (e.g. `principal_designer`
acting as PD on the project — their role should only be changed by another manager,
not by a `client` user who also has `canEditThreshold`).

**Fix**:
```tsx
{canEditThreshold && !isProjectManagementRole(member.role) && (...)
```

---

### IMPROVEMENT-1 — Raw `=== "admin"` literals in API routes (LOW)

**Files**:
- `src/app/api/dashboard/stats/route.ts`
- `src/app/api/dashboard/activity/route.ts`
- `src/app/api/rams/[ramsId]/route.ts`
- `src/app/api/rams/[ramsId]/report/route.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/[projectId]/route.ts`

**Problem**: Logic was correct but brittle — if the admin role identifier ever changed,
every literal would need updating individually with no compiler assistance.

**Fix**: All replaced with `isAdminRole(role)` from `@/lib/auth/roles`.

---

### IMPROVEMENT-2 — `email ?? ""` passed empty string to `ensureProfile` (LOW)

**File**: `src/app/api/dashboard/stats/route.ts`

**Before**:
```ts
await ensureProfile(user.id, user.email ?? "", ...)
```

**Problem**: `ensureProfile` treats an empty string as a resolved email and skips
the admin-API fallback lookup, potentially creating a profile row with an empty email.

**Fix**:
```ts
await ensureProfile(user.id, user.email, ...)
```

---

## Current state (post-fix)

```
npx tsx scripts/audit-roles.ts
✅  No raw role-literal checks found. All checks use approved helpers.
```

All role checks in application code use the centralized helpers.
The only occurrences of raw literals are inside `src/lib/auth/roles.ts` (the
definition) and test files (which mock the helpers), both excluded by the script.
