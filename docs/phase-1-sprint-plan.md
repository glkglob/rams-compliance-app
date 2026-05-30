# Phase 1 Sprint Plan — RAMS Compliance App

**Based on:** Phase 1 Technical Architecture Plan  
**Goal:** Deliver a solid, secure foundation for project management and governance before document upload flows.

---

## Sprint Structure

We recommend **3 focused sprints** (2-week cycles recommended).

---

## Sprint 1: Foundation Hardening (Priority: Critical)

**Theme:** Make the existing system consistent, auditable, and manageable.

### Key Deliverables
- Centralized permission checking layer
- Full audit logging for projects and memberships
- Ability to edit compliance threshold per project
- Basic project membership management UI

### Stories / Tasks

| # | Story | Priority | Notes |
|---|-------|----------|-------|
| S1-1 | Create `lib/auth/permissions.ts` with reusable helpers (`canManageProject`, `canViewProject`, `isAdmin`, etc.) | High | Replace scattered checks |
| S1-2 | Audit all project-related API routes and ensure they use the new permission layer | High | Especially `/api/projects/*` |
| S1-3 | Add audit logging for: project create/update/delete, membership changes, threshold changes | High | **DONE** — `createAuditLog` used in PATCH `/api/projects/[projectId]` and membership routes |
| S1-4 | Add UI to view and edit `compliance_threshold` on project settings page | High | **DONE** — editable in `src/app/projects/[projectId]/page.tsx`, gated by `canEditThreshold` (admin / project_manager) |
| S1-5 | Build project membership management UI (list members, change role, remove) | Medium | Under project settings |
| S1-6 | Add API endpoints for membership management (invite/update/remove) | High | With proper RLS + audit |
| S1-7 | Ensure all mutating project actions are logged in `audit_logs` | High | Close current gaps |

**Exit Criteria:**
- Every project-scoped API route enforces permissions via a shared service
- Changing a project's compliance threshold is logged and auditable
- Users can manage project members from the UI (as permitted by role)
- No major permission bypasses remain

---

## Sprint 2: Visibility & Experience (Priority: High)

**Theme:** Make the app feel useful and trustworthy on a daily basis.

### Key Deliverables
- Improved dashboard with actionable information
- Better project overview and list experience
- Project activity feed (powered by audit logs)
- Consistent role-based UI gating

### Stories / Tasks

| # | Story | Priority | Notes |
|---|-------|----------|-------|
| S2-1 | Redesign / enhance dashboard with meaningful stats and quick actions | High | Projects, recent activity, thresholds |
| S2-2 | Add "Recent Activity" section on project pages (sourced from audit logs) | Medium | Shows key changes |
| S2-3 | Improve project list with role, threshold, and status visibility | High | |
| S2-4 | Add consistent role-based UI hiding/disabling across the app | Medium | Buttons, menu items, etc. |
| S2-5 | Create project settings page structure (thresholds + members + general) | High | |
| S2-6 | Add basic project health indicators (e.g., "Threshold last updated", member count) | Low | Nice to have |

**Exit Criteria:**
- Dashboard gives users clear next actions
- Users can see who has access to their projects and recent changes
- Role-based UI differences are obvious and consistent

---

## Sprint 3: Hardening, Polish & Release Prep (Priority: High)

**Theme:** Production readiness and clarity.

### Key Deliverables
- Security & RLS review
- Documentation of permission model
- CSP finalization
- Feature flagging / clear messaging that document upload is Phase 2
- Performance and reliability improvements

### Stories / Tasks

| # | Story | Priority | Notes |
|---|-------|----------|-------|
| S3-1 | Full security review of RLS policies + API permission checks | High | |
| S3-2 | Document the permission model (who can do what) in `/docs` | Medium | For devs + future stakeholders |
| S3-3 | Finalize and lock CSP policy (remove debug allowances if possible) | High | |
| S3-4 | Add clear UI messaging that document upload & analysis is coming in Phase 2 | Medium | |
| S3-5 | Add loading states, error boundaries, and better empty states | Medium | |
| S3-6 | Performance review of key queries (especially dashboard + project lists) | Medium | Add indexes if needed |
| S3-7 | End-to-end testing of critical flows (create project, change threshold, manage members) | High | |

**Exit Criteria:**
- Phase 1 is considered production-ready from a security and usability standpoint
- New team members can understand the permission model from documentation
- All major gaps identified in the Technical Architecture Plan are closed

---

## Backlog / Phase 2 Candidates

- Advanced compliance threshold rules (multiple categories, templates)
- Organization-level settings
- Invitation system with email
- Project templates
- Document upload & analysis (core of Phase 2)
- RAMS submission workflow enhancements

---

## Recommended Starting Point

**Start with Sprint 1.**

The highest leverage work is making permissions, auditing, and threshold management solid and consistent before adding more surface area.

Would you like me to:
- Break Sprint 1 into detailed user stories with acceptance criteria?
- Start implementing the highest priority item (e.g. centralized permissions layer)?
- Create a Notion / Linear-style ticket export version of this plan?
