import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { handleAPIError, UnauthorizedError, ForbiddenError, NotFoundError } from "@/lib/error-handling";

type Context = { params: Promise<{ ramsId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { ramsId } = await params;
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new UnauthorizedError();
    }

    const { data: rams, error } = await supabase
      .from("rams_submissions")
      .select(`
        *,
        projects!inner (name, compliance_threshold),
        rams_reviews (*, review_checks (*)),
        generated_emails (*)
      `)
      .eq("id", ramsId)
      .order("created_at", { referencedTable: "rams_reviews", ascending: false })
      .order("created_at", { referencedTable: "generated_emails", ascending: false })
      .single();

    if (error || !rams) {
      throw new NotFoundError("RAMS not found");
    }

    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", rams.project_id)
      .eq("user_id", user.id)
      .single();

    let currentUserRole: string | null = membership?.role ?? null;

    if (!membership) {
      // Defensive fallback: trigger may not have fired for pre-existing users.
      const { data: rawProfile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const profile =
        !profileError && rawProfile
          ? rawProfile
          : await ensureProfile(user.id, user.email ?? "", user.user_metadata?.full_name as string | undefined);

      if (!profile || profile.role !== "admin") {
        throw new ForbiddenError();
      }
      currentUserRole = profile.role;
    }

    return NextResponse.json({ ...rams, currentUserRole }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
