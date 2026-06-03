import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { handleAPIError, UnauthorizedError } from "@/lib/error-handling";
import { getOrCreateDefaultOrganisation, listOrganisationsForUser } from "@/lib/domain/organisations/organisation-service";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new UnauthorizedError();

    const orgs = await listOrganisationsForUser(user.id);
    return NextResponse.json(orgs);
  } catch (e) {
    return handleAPIError(e);
  }
}

export async function POST() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new UnauthorizedError();

    // For basic: just ensure default exists (real would validate name etc.)
    const org = await getOrCreateDefaultOrganisation();
    return NextResponse.json(org, { status: 201 });
  } catch (e) {
    return handleAPIError(e);
  }
}
