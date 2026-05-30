# Phase 1 Technical Architecture Plan — RAMS Compliance App

**Status**: Draft  
**Date**: 2026-05  
**Phase Focus**: Foundation — Secure access, project management, dashboard visibility, and governance (no document upload/review in this phase).

---

## 1. Executive Summary

Phase 1 establishes the core platform foundation for a **UK construction compliance decision-support tool**. The architecture must support secure, role-aware project management with auditability and data protection via Row Level Security (RLS), while keeping the system simple enough to ship quickly.

Key architectural priorities for Phase 1:
- Strong identity + authorization model
- Project as the primary unit of organization and access control
- Lightweight but extensible compliance threshold configuration
- Comprehensive audit logging
- Reliable enforcement of security boundaries (RLS + API layer)
- Production-ready deployment on Railway using Docker images

---

## 2. Current State Assessment

### 2.1 What Already Exists (Strong Foundation)
- Supabase Auth with email/password + role mapping
- Projects + Project Members model with RLS policies
- Basic `compliance_threshold` column on `projects` (INTEGER 0–100, default 80)
- Audit logging table + helper functions
- Role-based permission system (`admin`, `project_manager`, `reviewer`, `viewer`)
- Protected routes (auth enforced at API layer; no middleware.ts used)
- Dashboard stats endpoint
- Railway + Docker production setup with standalone output

### 2.2 Gaps for Phase 1

> **Status update (Sprint 1 retrospective):** the threshold-editing UI and its
> audit trail have shipped — see the project settings page
> (`src/app/projects/[projectId]/page.tsx`) and the PATCH route
> (`src/app/api/projects/[projectId]/route.ts`) which logs threshold changes
> through `createAuditLog`. The gap list below reflects what remained open
> after the Sprint 1 work; items struck through are now closed.

- ~~No dedicated UI for managing compliance thresholds (currently only set at project creation)~~ **(done — Sprint 1)**
- Audit logging coverage is incomplete in several API routes (partially addressed; project + threshold mutations now logged)
- Role enforcement is inconsistent between UI and some API routes
- No clear separation between "project settings" and "compliance configuration"
- Limited visibility into project membership and role management from the UI
- CSP is still evolving (recent fixes for fonts and scripts)

---

## 3. Recommended Architecture

### 3.1 Data Model

#### Core Tables (Phase 1 scope)
- `profiles` (linked to `auth.users`)
- `projects`
  - `compliance_threshold` (keep simple INTEGER for Phase 1)
- `project_members` (with `role`)
- `audit_logs`

#### Phase 1 Recommendation: Keep `compliance_threshold` on `projects`
Do **not** create a separate `compliance_thresholds` table in Phase 1. The current single-value model is sufficient for the decision-support framing.

Future evolution (Phase 2/3) can introduce:
- Multiple threshold categories (e.g., structural, environmental, safety)
- Threshold history / versioning
- Default templates per organization

### 3.2 Authorization Model

**Recommended Pattern**:
- `project_members.role` is the source of truth for project-level access.
- Use database functions (`is_project_member`, `can_manage_project`, `is_admin`, etc.) consistently.
- API routes should **always** re-validate permissions (never trust client).

**Role Mapping (already defined)**:
- `admin`: Full system access
- `project_manager`: Full control within their projects + create projects
- `reviewer`: Review and generate content within projects
- `viewer`: Read-only access

**Phase 1 Focus Areas**:
- Ensure every project-scoped API route uses `can_manage_project` or equivalent.
- Add membership management UI (invite, change role, remove).
- Centralize permission checks in a `lib/auth/permissions.ts` (or similar).

### 3.3 Audit Logging Strategy

**Current State**: Basic `audit_logs` table exists.

**Phase 1 Requirements**:
- Log all mutating actions on projects and memberships.
- Log threshold changes.
- Log role changes.
- Capture actor (`user_id`), action, entity, before/after state where relevant.

**Recommendation**:
Create a small `audit` service layer that all critical routes go through, rather than sprinkling `createAuditLog` calls everywhere.

### 3.4 Compliance Thresholds (Phase 1 Scope)

**Model**: Simple scalar value per project (already exists).

**UI/UX Deliverable**:
- Ability to view and edit `compliance_threshold` from the project settings page.
- Display current threshold on project overview/dashboard cards.
- Basic validation (0–100).

Do **not** build complex threshold rule engines in Phase 1.

### 3.5 Dashboard Architecture

**Minimum Viable Dashboard**:
- Projects the user belongs to (with role)
- Key stats (total projects, active RAMS submissions, overdue items — even if RAMS is light in Phase 1)
- Quick actions (Create Project, View My Projects)

**Data Access**:
- Use the existing `/api/dashboard/stats` pattern.
- Ensure all stats queries respect RLS (no service role bypass except for admin overviews).

### 3.6 Security & Data Protection

**Must-Have for Phase 1**:
- All project-scoped data access goes through RLS policies (already largely in place).
- Service role (`supabase-admin`) only used for truly privileged operations (e.g., user management, certain cron jobs).
- Audit logs are append-only from the application perspective (consider RLS that prevents updates/deletes except via admin functions).

### 3.7 Deployment & Infrastructure

**Current (Good)**:
- Multi-stage Dockerfile targeting `linux/amd64`
- Image-based deploys to Railway (recommended path)
- GitHub Actions for Docker Hub builds + Railway trigger

**Phase 1 Recommendations**:
- Pin production deploys to SHA tags instead of `latest` where possible.
- Add health check + graceful shutdown handling.
- Ensure environment validation fails fast on missing critical vars (already partially implemented).

---

## 4. Key Technical Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|----------|
| Inconsistent RLS enforcement across new routes | Medium | High | Create a standard API route template + shared permission helper (no middleware used) |
| Audit log tampering | Low | High | Make audit table append-only via RLS + database triggers |
| Role drift between UI and API | Medium | Medium | Central permission service + tests |
| Over-engineering thresholds too early | High | Medium | Explicitly scope to single `compliance_threshold` value in Phase 1 |
| CSP maintenance burden | Medium | Medium | Document current policy (static headers() CSP with unsafe-inline; no middleware/nonce approach) |

---

## 5. Recommended Phasing Within Phase 1

**Sprint 1 – Foundation Hardening** _(largely complete — see Section 2.2 status update)_
- Standardize permission checking across all project routes
- Add membership management UI + APIs
- Wire up audit logging for all project + membership mutations — **done** for project + threshold changes
- Expose compliance threshold editing in project settings — **done**

**Sprint 2 – Visibility & Polish**
- Enhance dashboard with meaningful project-level stats
- Improve project list / overview experience
- Add basic project activity / recent changes feed (powered by audit logs)
- Security review + RLS policy audit

**Sprint 3 – Hardening & Release Prep**
- Role-based UI gating improvements
- Documentation of permission model
- Production CSP finalization
- Load testing / performance review of key queries

---

## 6. Open Questions to Resolve Before Sprint Planning

1. Should `compliance_threshold` be editable only by `project_manager` + `admin`, or also by `reviewer`?
2. Do we need a concept of "organization" in Phase 1, or is everything project-scoped for now?
3. What is the minimum set of dashboard statistics that actually drive user behavior?
4. How strictly do we want to enforce "no document upload" in Phase 1 UI (feature flags vs route protection)?

---

## Next Steps

1. Review and agree on this architecture direction.
2. Decide on the open questions above.
3. Convert into a detailed **Sprint Plan** with user stories and acceptance criteria.
4. (Optional) Create a lightweight PRD if stakeholder alignment is needed.

---

*This document is intentionally technical and implementation-focused. It assumes the product direction in the Phase 1 Product Plan is accepted.*
