import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Clock,
  FolderOpen,
  Gauge,
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
import { DocumentUploadDemo } from "@/components/landing/document-upload-demo";

const availableToday = [
  {
    icon: ShieldCheck,
    title: "Secure by default",
    description:
      "Supabase authentication, role-based permissions, and RLS-protected API routes guard every request.",
  },
  {
    icon: Users,
    title: "Role-based access",
    description:
      "Invite teammates and assign roles so the right people can view, manage, and administer each project.",
  },
  {
    icon: FolderOpen,
    title: "Project-first workflow",
    description:
      "Create and organise construction projects, capture key details, and set the compliance threshold for each one.",
  },
  {
    icon: Clock,
    title: "Audit trail & activity",
    description:
      "Key actions are recorded in an audit log, with a dashboard that surfaces project stats and recent activity.",
  },
];

const comingSoon = [
  {
    icon: Sparkles,
    title: "AI-assisted RAMS review",
    description:
      "AI highlights gaps against your requirements to speed up reviewer decisions — always human-checked.",
  },
  {
    icon: Gauge,
    title: "Automated compliance scoring",
    description:
      "Score submissions against project thresholds and track compliance status over time.",
  },
];

export default function Home() {
  return (
    <div className="container mx-auto max-w-6xl px-6 py-16">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Phase 1 · Available now
          </span>
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              A secure, project-centric workspace for RAMS compliance.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Set up construction projects, manage your team with role-based
              access, and keep a clear audit trail — all in one place. Built from
              the ground up to support AI-assisted RAMS review in upcoming phases.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/login">
                Get started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Phase 1 delivers the secure foundation. Document upload, AI-assisted
            review, and compliance scoring are in development — see what&apos;s
            coming below.
          </p>
        </section>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Secure by default
              </CardTitle>
              <CardDescription>
                Supabase auth, role-based permissions, audit logging, and
                RLS-protected API routes.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FolderOpen className="h-5 w-5 text-primary" />
                Project-first workflow
              </CardTitle>
              <CardDescription>
                Create projects, invite teammates with roles, and set compliance
                thresholds — ready for the review workflows coming next.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/projects">Browse projects</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <section className="mt-16 space-y-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">
            What you can do today
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {availableToday.map(({ icon: Icon, title, description }) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-5 w-5 text-primary" />
                  {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-12 space-y-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-2xl font-semibold tracking-tight">
              In development
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            On the roadmap for upcoming phases. These features are not yet
            available.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Document Upload & Extraction - now a live interactive demo */}
          <div className="lg:col-span-1">
            <DocumentUploadDemo />
          </div>

          {/* Remaining coming soon features */}
          {comingSoon.slice(1).map(({ icon: Icon, title, description }) => (
            <Card key={title} className="border-dashed bg-muted/30">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="h-5 w-5" />
                    {title}
                  </span>
                  <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Coming soon
                  </span>
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <div className="mt-12 border-t pt-6 text-center text-xs text-muted-foreground">
        This is a decision-support tool for construction compliance. Final
        compliance decisions remain with qualified personnel.{" "}
        <Link href="/privacy" className="underline hover:text-foreground">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="underline hover:text-foreground">
          Terms
        </Link>
      </div>
    </div>
  );
}
