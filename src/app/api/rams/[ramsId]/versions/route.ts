import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { handleAPIError, NotFoundError, UnauthorizedError } from '@/lib/error-handling';
import { isAdminRole } from '@/lib/auth/roles';
import { ensureProfile } from '@/lib/profiles/ensure-profile';
import { withRequestContext } from '@/lib/request-context';

type Context = { params: Promise<{ ramsId: string }> };

/**
 * GET /api/rams/[ramsId]/versions
 *
 * Returns all versions in the same submission chain, ordered by version number.
 * Accepts any submission ID in the chain (root or child) and resolves the root.
 */
async function getVersions(_request: Request, { params }: Context) {
  try {
    const { ramsId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    // Load the target submission to discover the root
    const { data: target } = await supabase
      .from('rams_submissions')
      .select('id, parent_submission_id, project_id')
      .eq('id', ramsId)
      .single();

    if (!target) throw new NotFoundError('RAMS submission not found');

    const rootId = target.parent_submission_id ?? target.id;

    // Membership / admin check
    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', target.project_id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      const { data: rawProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      const profile = rawProfile ?? (await ensureProfile({ user, supabase }));
      if (!profile || !isAdminRole(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Fetch all versions: the root (id = rootId) + all children (parent_submission_id = rootId)
    const { data: versions, error } = await supabase
      .from('rams_submissions')
      .select('id, version_number, file_name, review_status, compliance_score, created_at, subcontractor_name, parent_submission_id')
      .or(`id.eq.${rootId},parent_submission_id.eq.${rootId}`)
      .order('version_number', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Failed to load versions' }, { status: 500 });
    }

    return NextResponse.json({
      rootId,
      currentId: ramsId,
      versions: versions ?? [],
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

export const GET = withRequestContext(getVersions, '/api/rams/[ramsId]/versions');
