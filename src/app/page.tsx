import Link from "next/link";
import { ArrowRight, FolderOpen, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <div className="container mx-auto flex min-h-screen max-w-6xl items-center px-6 py-16">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section className="space-y-6">
          <span className="inline-flex rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
            Phase 1 foundation
          </span>
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              RAMS document compliance, organized around projects.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              This foundation includes Supabase auth, project CRUD, dashboard
              stats, role-aware access control, and the first app screens for
              the RAMS Compliance Web App.
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
        </section>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Secure by default
              </CardTitle>
              <CardDescription>
                Supabase auth, role permissions, audit logging, and RLS-aware API
                routes.
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
                Create projects, set compliance thresholds, and prepare for
                document upload in Phase 2.
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

      <div className="mt-12 border-t pt-6 text-center text-xs text-muted-foreground">
        This is a decision-support tool for construction compliance.{' '}
        <Link href="/privacy" className="underline hover:text-foreground">Privacy</Link> ·{' '}
        <Link href="/terms" className="underline hover:text-foreground">Terms</Link>
      </div>
    </div>
  );
}
