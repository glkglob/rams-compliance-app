import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/db/supabase-server";
import { handleAPIError, UnauthorizedError } from "@/lib/error-handling";
import { logger } from "@/lib/logging";

interface DashboardStats {
  totalProjects: number;
  pendingReviews: number;
  approvedRAMS: number;
  rejectedRAMS: number;
  manualReviews: number;
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new UnauthorizedError();
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    const baseStats: DashboardStats = {
      totalProjects: 0,
      pendingReviews: 0,
      approvedRAMS: 0,
      rejectedRAMS: 0,
      manualReviews: 0,
    };

    if (profile.role === "admin") {
      const [{ count: totalProjects, error: projectError }, { data: ramsData, error: ramsError }] =
        await Promise.all([
          supabase.from("projects").select("*", { count: "exact", head: true }),
          supabase.from("rams_submissions").select("review_status"),
        ]);

      if (projectError || ramsError) {
        logger.error("Failed to load admin stats", { error: projectError?.message ?? ramsError?.message });
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          totalProjects: totalProjects ?? 0,
          pendingReviews:
            ramsData?.filter((submission: { review_status: string }) => submission.review_status === "pending")
              .length ?? 0,
          approvedRAMS:
            ramsData?.filter((submission: { review_status: string }) => submission.review_status === "approved")
              .length ?? 0,
          rejectedRAMS:
            ramsData?.filter((submission: { review_status: string }) => submission.review_status === "rejected")
              .length ?? 0,
          manualReviews:
            ramsData?.filter(
              (submission: { review_status: string }) => submission.review_status === "manual_review"
            ).length ?? 0,
        } satisfies DashboardStats,
        { status: 200 }
      );
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);

    if (membershipError) {
      logger.error("Failed to fetch memberships for stats", { error: membershipError.message });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const projectIds = memberships?.map((membership: { project_id: string }) => membership.project_id) ?? [];

    if (projectIds.length === 0) {
      return NextResponse.json(baseStats, { status: 200 });
    }

    const { data: ramsData, error: ramsError } = await supabase
      .from("rams_submissions")
      .select("review_status")
      .in("project_id", projectIds);

    if (ramsError) {
      logger.error("Failed to fetch RAMS stats", { error: ramsError.message });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json(
      {
        totalProjects: projectIds.length,
        pendingReviews:
          ramsData?.filter((submission: { review_status: string }) => submission.review_status === "pending")
            .length ?? 0,
        approvedRAMS:
          ramsData?.filter((submission: { review_status: string }) => submission.review_status === "approved")
            .length ?? 0,
        rejectedRAMS:
          ramsData?.filter((submission: { review_status: string }) => submission.review_status === "rejected")
            .length ?? 0,
        manualReviews:
          ramsData?.filter((submission: { review_status: string }) => submission.review_status === "manual_review")
            .length ?? 0,
      } satisfies DashboardStats,
      { status: 200 }
    );
  } catch (error) {
    return handleAPIError(error);
  }
}
