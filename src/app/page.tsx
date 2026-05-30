import Link from "next/link";
import {
  ArrowRight,
  BarChart2,
  CheckCircle,
  Clock,
  Eye,
  FileBox,
  FolderOpen,
  Gauge,
  Key,
  Lock,
  Monitor,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DocumentUploadDemo } from "@/components/landing/document-upload-demo";
import { ProductShowcase } from "@/components/landing/product-showcase";

export default function Home() {
  return (
    <div className="container mx-auto max-w-6xl px-6 py-16 space-y-24">

      {/* 1. HERO SECTION */}
      <section aria-label="Hero" className="space-y-10">
        {/* Headline + CTAs */}
        <div className="mx-auto max-w-3xl text-center space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Phase 1 · Available Now
          </span>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Review RAMS in one<br className="hidden sm:block" /> secure workspace.
          </h1>

          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Create projects, manage reviewer access, set compliance thresholds, and
            maintain a complete audit trail for every decision. AI-assisted document
            review is coming next.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg">
              <Link href="/login">
                Start Phase 1 Workspace
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="#coming-next">View Product Roadmap</Link>
            </Button>
          </div>
        </div>

        {/* Product mockup — 3-panel app window */}
        <div className="rounded-xl border bg-card shadow-lg overflow-hidden">
          {/* Window chrome */}
          <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5">
            <span className="h-3 w-3 rounded-full bg-red-400/70" />
            <span className="h-3 w-3 rounded-full bg-yellow-400/70" />
            <span className="h-3 w-3 rounded-full bg-green-400/70" />
            <span className="mx-auto text-xs font-medium text-muted-foreground tracking-wide">
              RAMS Compliance — Road Works Phase 2
            </span>
          </div>

          {/* 3-panel layout */}
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] lg:grid-cols-[160px_1fr_220px] min-h-[360px]">

            {/* Sidebar */}
            <nav className="hidden sm:flex flex-col border-r bg-muted/20 text-xs">
              <div className="px-3 pt-4 pb-2 font-semibold text-muted-foreground uppercase tracking-wider">Navigation</div>
              {[
                { label: "Dashboard", active: false },
                { label: "Projects", active: false },
                { label: "Road Works Ph. 2", active: true },
                { label: "Documents", active: false },
                { label: "Audit Trail", active: false },
                { label: "Settings", active: false },
              ].map(({ label, active }) => (
                <div
                  key={label}
                  className={"px-3 py-2 rounded-md mx-2 mb-0.5 font-medium cursor-default " + (
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  {label}
                </div>
              ))}
            </nav>

            {/* Main review panel */}
            <div className="p-5 space-y-4 border-r border-border/60">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">RAMS Submission</p>
                  <p className="font-semibold text-sm mt-0.5">Road Works Phase 2 — Method Statement</p>
                </div>
                <span className="rounded-full border px-2.5 py-0.5 text-xs font-semibold text-yellow-700 border-yellow-300 bg-yellow-50">
                  Pending Review
                </span>
              </div>

              {/* Compliance score ring + threshold */}
              <div className="flex items-center gap-5 rounded-lg border bg-muted/20 p-4">
                {/* SVG donut ring */}
                <div className="relative shrink-0">
                  <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
                    <circle cx="32" cy="32" r="26" fill="none" stroke="hsl(var(--border))" strokeWidth="7" />
                    <circle
                      cx="32" cy="32" r="26" fill="none"
                      stroke="hsl(var(--primary))" strokeWidth="7"
                      strokeDasharray="163.4"
                      strokeDashoffset="40.85"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold rotate-90">75%</span>
                </div>
                <div className="space-y-1.5 text-xs min-w-0">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Compliance score</span>
                    <span className="font-semibold">75 / 100</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Threshold</span>
                    <span className="font-semibold">80%</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-semibold text-yellow-700">Below threshold</span>
                  </div>
                </div>
              </div>

              {/* Review notes + actions */}
              <div className="space-y-2">
                <p className="text-xs font-medium">Reviewer notes</p>
                <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground italic min-h-12">
                  Section 4 (working at height) does not reference the site-specific rescue plan. Please resubmit with appendix C attached.
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1 rounded-md border-2 border-green-600/40 bg-green-50/50 py-1.5 text-center text-xs font-semibold text-green-700">
                  Approve
                </div>
                <div className="flex-1 rounded-md border-2 border-destructive/40 bg-destructive/5 py-1.5 text-center text-xs font-semibold text-destructive">
                  Reject
                </div>
                <div className="flex-1 rounded-md border py-1.5 text-center text-xs font-semibold text-muted-foreground">
                  Override
                </div>
              </div>
            </div>

            {/* Audit trail panel */}
            <div className="hidden lg:flex flex-col p-4 space-y-1 bg-muted/10">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Audit Trail</p>

              {[
                { action: "Submission created", actor: "J. Smith", time: "09:14", dot: "bg-blue-500" },
                { action: "Document extracted", actor: "System", time: "09:14", dot: "bg-muted-foreground/40" },
                { action: "Assigned to reviewer", actor: "M. Johnson", time: "09:16", dot: "bg-blue-500" },
                { action: "Review notes added", actor: "M. Johnson", time: "10:02", dot: "bg-yellow-500" },
                { action: "Override requested", actor: "M. Johnson", time: "10:05", dot: "bg-orange-500" },
              ].map(({ action, actor, time, dot }) => (
                <div key={action + time} className="flex gap-2.5 py-1.5 border-b border-border/40 last:border-0">
                  <div className={"mt-1.5 h-2 w-2 rounded-full shrink-0 " + dot} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-tight">{action}</p>
                    <p className="text-[10px] text-muted-foreground">{actor} · {time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mockup footer note */}
          <div className="border-t bg-muted/20 px-4 py-2 text-center text-[10px] text-muted-foreground">
            Illustrative mockup · Sign in to access the live application
          </div>
        </div>
      </section>

      {/* 2. AVAILABLE NOW SECTION */}
      <section aria-label="Available Now" className="space-y-6">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Available Now</h2>
          <Badge variant="secondary">Live in Phase 1</Badge>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <FolderOpen className="h-6 w-6 text-primary mb-3" />
              <CardTitle className="text-base font-semibold">Project Management</CardTitle>
              <CardDescription>
                Create and organise RAMS reviews by project, client, and site.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <ShieldCheck className="h-6 w-6 text-primary mb-3" />
              <CardTitle className="text-base font-semibold">Reviewer Access Control</CardTitle>
              <CardDescription>
                Assign reviewers and manage access with role-based permissions.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <BarChart2 className="h-6 w-6 text-primary mb-3" />
              <CardTitle className="text-base font-semibold">Compliance Tracking</CardTitle>
              <CardDescription>
                Track review outcomes, approval status, and project-level compliance metrics.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* 3. HOW IT WORKS SECTION */}
      <section aria-label="How RAMS Review Works" className="space-y-8">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">How RAMS Review Works</h2>
          <p className="text-muted-foreground">
            Five steps from project creation to a complete, auditable compliance record.
          </p>
        </div>

        <div className="relative">
          {/* Horizontal connector line — desktop only, rendered behind step circles */}
          <div
            className="hidden lg:block absolute inset-x-0 top-[18px] border-t-2 border-dashed border-border"
            aria-hidden="true"
          />

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">

            {/* Step 1 */}
            <div className="flex flex-row items-start gap-4 lg:flex-col lg:items-center lg:gap-3">
              <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-background bg-primary text-sm font-bold text-primary-foreground">
                1
              </div>
              <div className="space-y-1 pt-1 lg:pt-0 lg:text-center">
                <p className="text-sm font-semibold">Create Project</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Set up a new review workspace.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex flex-row items-start gap-4 lg:flex-col lg:items-center lg:gap-3">
              <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-background bg-primary text-sm font-bold text-primary-foreground">
                2
              </div>
              <div className="space-y-1 pt-1 lg:pt-0 lg:text-center">
                <p className="text-sm font-semibold">Invite Reviewers</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Assign responsibility and permissions.
                </p>
              </div>
            </div>

            {/* Step 3 — compliance threshold helper */}
            <div className="flex flex-row items-start gap-4 lg:flex-col lg:items-center lg:gap-3">
              <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-background bg-primary text-sm font-bold text-primary-foreground">
                3
              </div>
              <div className="space-y-2 pt-1 lg:pt-0 lg:text-center">
                <p className="text-sm font-semibold">Set Threshold</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Define the compliance score required for approval.
                </p>
                <div className="rounded-md border bg-muted/40 px-2.5 py-2 text-left text-[11px] leading-snug text-muted-foreground">
                  <span className="font-semibold">What is a threshold?</span>{" "}
                  The minimum score (e.g. 80%) a RAMS submission must reach before it can be approved.
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex flex-row items-start gap-4 lg:flex-col lg:items-center lg:gap-3">
              <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-background bg-primary text-sm font-bold text-primary-foreground">
                4
              </div>
              <div className="space-y-1 pt-1 lg:pt-0 lg:text-center">
                <p className="text-sm font-semibold">Review Submissions</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Assess RAMS against project requirements.
                </p>
              </div>
            </div>

            {/* Step 5 */}
            <div className="flex flex-row items-start gap-4 lg:flex-col lg:items-center lg:gap-3">
              <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-background bg-primary text-sm font-bold text-primary-foreground">
                5
              </div>
              <div className="space-y-1 pt-1 lg:pt-0 lg:text-center">
                <p className="text-sm font-semibold">Track Audit History</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Maintain a complete record of decisions and changes.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 3.5 PRODUCT SHOWCASE SECTION */}
      <section aria-label="Product Preview" className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Product Preview</h2>
          <p className="text-muted-foreground">
            Explore the five core views of the RAMS Compliance workspace.
          </p>
        </div>
        <ProductShowcase />
      </section>

      {/* 4. LIVE DEMO SECTION */}
      <section aria-label="See it in action" className="space-y-6">
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">See it in action</h2>
        </div>
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <DocumentUploadDemo />

          <div className="pointer-events-none">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base font-semibold">RAMS Submission — Road Works Phase 2</CardTitle>
                  <Badge variant="warning">Pending Review</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Submitted by</dt>
                    <dd className="font-medium">J. Smith</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Compliance threshold</dt>
                    <dd className="font-medium">80%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Documents attached</dt>
                    <dd className="font-medium">3 files</dd>
                  </div>
                </dl>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Reviewer notes</label>
                  <textarea
                    disabled
                    placeholder="Enter review notes..."
                    className="w-full rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground resize-none h-20"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" disabled className="flex-1 border-green-600 text-green-700">Approve</Button>
                  <Button variant="outline" disabled className="flex-1 border-destructive text-destructive">Reject</Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">Interactive mockup — full review workflow available after sign-in</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 5. USER ROLES SECTION */}
      <section aria-label="User roles" className="space-y-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Built for your whole team</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <Shield className="h-6 w-6 text-primary mb-2" />
              <CardTitle>Project Admin</CardTitle>
              <CardDescription>
                Creates and configures projects, sets compliance thresholds, invites team members, and has full administrative access.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Create &amp; archive projects</li>
                <li>• Set compliance thresholds</li>
                <li>• Invite &amp; manage team roles</li>
                <li>• Access full audit trail</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Eye className="h-6 w-6 text-primary mb-2" />
              <CardTitle>Compliance Reviewer</CardTitle>
              <CardDescription>
                Reviews submitted RAMS documents, records approval or rejection decisions, and adds notes for the audit record.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Review RAMS submissions</li>
                <li>• Approve or reject documents</li>
                <li>• Add review notes</li>
                <li>• Override decisions with justification</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <BarChart2 className="h-6 w-6 text-primary mb-2" />
              <CardTitle>Project Manager</CardTitle>
              <CardDescription>
                Monitors project status, tracks compliance across submissions, and coordinates the review team.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• View project dashboard</li>
                <li>• Track review progress</li>
                <li>• Monitor compliance status</li>
                <li>• Coordinate with reviewers</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 6. COMING NEXT SECTION */}
      <section id="coming-next" aria-label="Roadmap" className="space-y-6">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-2xl font-semibold tracking-tight">Coming Next</h2>
          <Badge variant="outline">Roadmap</Badge>
        </div>
        <p className="text-muted-foreground">These features are in development. We will update this page as each one ships.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-dashed bg-muted/30">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <Sparkles className="h-5 w-5 text-muted-foreground" />
                <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Coming Next</span>
              </div>
              <CardTitle className="text-base text-muted-foreground">AI-Assisted Gap Analysis</CardTitle>
              <CardDescription>
                AI highlights where a RAMS submission may not meet your project requirements — a reviewer always makes the final call.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-dashed bg-muted/30">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <Gauge className="h-5 w-5 text-muted-foreground" />
                <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Coming Next</span>
              </div>
              <CardTitle className="text-base text-muted-foreground">Automated Compliance Scoring</CardTitle>
              <CardDescription>
                Score each submission against your threshold and track compliance status over time without manual tallying.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-dashed bg-muted/30">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <FileBox className="h-5 w-5 text-muted-foreground" />
                <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Planned</span>
              </div>
              <CardTitle className="text-base text-muted-foreground">Evidence Pack Export</CardTitle>
              <CardDescription>
                Generate a downloadable evidence pack for each project — decisions, notes, and document history in one PDF.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* 7. SECURITY & AUDITABILITY SECTION */}
      <section aria-label="Security and auditability" className="bg-muted/30 rounded-2xl p-8 sm:p-12 space-y-6">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Security and auditability by design</h2>
        </div>
        <p className="text-muted-foreground">Every action is logged. Access is gated. Your compliance record is always ready.</p>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex gap-3">
            <div className="rounded-lg bg-background border p-2 shadow-sm h-fit">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Supabase Authentication</p>
              <p className="text-sm text-muted-foreground">Email-based sign-in with secure session management. No passwords stored in application code.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="rounded-lg bg-background border p-2 shadow-sm h-fit">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Row-Level Security</p>
              <p className="text-sm text-muted-foreground">Supabase RLS policies ensure users can only read and write data they are authorised to access.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="rounded-lg bg-background border p-2 shadow-sm h-fit">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Full Audit Trail</p>
              <p className="text-sm text-muted-foreground">Every review decision, override, and project change is recorded with a timestamp and user identity.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="rounded-lg bg-background border p-2 shadow-sm h-fit">
              <Key className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Role-Gated API Routes</p>
              <p className="text-sm text-muted-foreground">Every API endpoint checks the caller&apos;s role before returning data or accepting changes.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 8. FINAL CTA SECTION */}
      <section aria-label="Call to action" className="mt-16 py-12 text-center space-y-6">
        <h2 className="text-2xl font-bold sm:text-3xl">
          Ready to bring your RAMS review process into one place?
        </h2>
        <p className="text-muted-foreground">
          Start with Phase 1 today — project management, role-based access, document upload, and audit trail are live.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row justify-center">
          <Button asChild>
            <Link href="/login">
              Create your first project
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          This is a decision-support tool. Final compliance decisions remain with qualified personnel.{" "}
          <Link href="/privacy" className="underline hover:text-foreground">Privacy</Link>
          {" · "}
          <Link href="/terms" className="underline hover:text-foreground">Terms</Link>
        </p>
      </section>
    </div>
  );
}
