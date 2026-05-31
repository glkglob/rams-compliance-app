import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { handleAPIError, NotFoundError, UnauthorizedError } from "@/lib/error-handling";
import { isAdminRole } from "@/lib/auth/roles";
import { logger } from "@/lib/logging";
import { ensureProfile } from "@/lib/profiles/ensure-profile";

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
      const { data: rawProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const profile = rawProfile ?? (await ensureProfile({ user, supabase }));

      if (!profile || !isAdminRole(profile.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      currentUserRole = profile.role;
    }

    return NextResponse.json({ ...rams, currentUserRole }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
