import { NextResponse } from 'next/server';

import { createServerSupabase } from '@/lib/db/supabase-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

export async function DELETE(request: Request) {
  try {
    // 1. Identify the authenticated user (using regular RLS-aware client)
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;

    // Optional confirmation header or body flag from client
    const body = await request.json().catch(() => ({}));
    const confirmed = body?.confirmed === true;

    if (!confirmed) {
      return NextResponse.json(
        {
          error: 'Confirmation required',
          message: 'You must send { "confirmed": true } to permanently delete your account and associated data.',
        },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    const deletionSummary: Record<string, number | string | boolean> = {
      projectsDeleted: 0,
      ramsSubmissionsDeleted: 0,
      projectMembershipsRemoved: 0,
      auditLogsDeleted: 0,
      storageObjectsDeleted: 0,
      profileDeleted: false,
      authUserDeleted: false,
    };

    // 2. Find all projects created by this user
    const { data: ownedProjects, error: ownedError } = await admin
      .from('projects')
      .select('id, name')
      .eq('created_by', userId);

    if (ownedError) {
      console.error('Failed to fetch owned projects:', ownedError);
    }

    const projectsToDelete = ownedProjects ?? [];

    // 3. For each owned project: delete storage files then the project (DB cascades)
    for (const project of projectsToDelete) {
      const prefix = `${project.id}/`;

      try {
        // List and delete storage objects under this project (compliance-docs + rams)
        const deletedCount = await deleteAllStorageObjects(admin, 'documents', prefix);
        deletionSummary.storageObjectsDeleted =
          (deletionSummary.storageObjectsDeleted as number) + deletedCount;

        // Delete project row — DB cascades will handle:
        // compliance_documents, document_chunks, compliance_requirements,
        // rams_submissions, rams_reviews, review_checks, generated_emails, project_members
        const { error: projectDeleteError } = await admin
          .from('projects')
          .delete()
          .eq('id', project.id);

        if (projectDeleteError) {
          console.error(`Failed to delete project ${project.id}:`, projectDeleteError);
        } else {
          deletionSummary.projectsDeleted = (deletionSummary.projectsDeleted as number) + 1;
        }
      } catch (err) {
        console.error(`Error processing storage/project ${project.id}:`, err);
      }
    }

    // 4. Delete RAMS submissions the user submitted to *other* projects (they don't own)
    const { data: submittedRams, error: ramsFetchError } = await admin
      .from('rams_submissions')
      .select('id')
      .eq('submitted_by', userId);

    if (!ramsFetchError && submittedRams && submittedRams.length > 0) {
      // Delete storage for these RAMS too (they live under their project folders)
      for (const rams of submittedRams) {
        // We don't have easy access to storage_path here without another query,
        // but the project-level delete above already covered owned projects.
        // For non-owned, we still want to remove the RAMS record + its storage.
        // Fetch storage path
        const { data: ramsRow } = await admin
          .from('rams_submissions')
          .select('storage_path, project_id')
          .eq('id', rams.id)
          .single();

        if (ramsRow?.storage_path) {
          const { error: storageErr } = await admin.storage
            .from('documents')
            .remove([ramsRow.storage_path]);
          if (!storageErr) {
            deletionSummary.storageObjectsDeleted =
              (deletionSummary.storageObjectsDeleted as number) + 1;
          }
        }
      }

      const { error: ramsDeleteError } = await admin
        .from('rams_submissions')
        .delete()
        .eq('submitted_by', userId);

      if (!ramsDeleteError) {
        deletionSummary.ramsSubmissionsDeleted = submittedRams.length;
      }
    }

    // 5. Remove user from any remaining project memberships (projects they didn't create)
    const { data: memberships, error: memError } = await admin
      .from('project_members')
      .delete()
      .eq('user_id', userId)
      .select('id');

    if (!memError && memberships) {
      deletionSummary.projectMembershipsRemoved = memberships.length;
    }

    // 6. Delete audit logs created by this user (right to erasure)
    const { data: deletedLogs } = await admin
      .from('audit_logs')
      .delete()
      .eq('user_id', userId)
      .select('id');

    if (deletedLogs) {
      deletionSummary.auditLogsDeleted = deletedLogs.length;
    }

    // 7. Delete the profile (this should now have no blocking references)
    const { error: profileDeleteError } = await admin
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (!profileDeleteError) {
      (deletionSummary as any).profileDeleted = true;
    } else {
      console.error('Profile deletion failed:', profileDeleteError);
    }

    // 8. Finally, delete the Supabase Auth user (this is irreversible)
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);

    if (!authDeleteError) {
      (deletionSummary as any).authUserDeleted = true;
    } else {
      console.error('Auth user deletion failed:', authDeleteError);
      // Still return partial success — profile is already gone
    }

    // 9. Best-effort: invalidate all sessions for the deleted user
    try {
      // Supabase JS v2: use admin.deleteUser which already signs the user out.
      // We can also attempt to list and revoke sessions if needed in future.
    } catch (signOutErr) {
      // Non-fatal
      console.warn('Session invalidation after deletion (non-fatal):', signOutErr);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Account and associated personal data have been permanently deleted.',
        summary: deletionSummary,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Account deletion error:', error);
    return NextResponse.json(
      {
        error: 'Account deletion failed',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

/**
 * Recursively lists and removes all objects under a storage prefix.
 * Handles pagination and nested "folders" (Supabase Storage is flat but prefixes act as folders).
 */
async function deleteAllStorageObjects(
  admin: ReturnType<typeof getSupabaseAdmin>,
  bucket: string,
  prefix: string
): Promise<number> {
  let deleted = 0;
  const batchSize = 100;

  async function listAndDelete(currentPrefix: string): Promise<void> {
    const { data: items, error } = await admin.storage.from(bucket).list(currentPrefix, {
      limit: batchSize,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error || !items) {
      console.error(`Storage list error under ${currentPrefix}:`, error);
      return;
    }

    const filesToRemove: string[] = [];
    const foldersToRecurse: string[] = [];

    for (const item of items) {
      const fullPath = currentPrefix ? `${currentPrefix}${item.name}` : item.name;

      if (item.id === null && item.metadata === null) {
        // This is a "folder" placeholder in Supabase Storage
        foldersToRecurse.push(`${fullPath}/`);
      } else {
        filesToRemove.push(fullPath);
      }
    }

    if (filesToRemove.length > 0) {
      const { error: removeError } = await admin.storage.from(bucket).remove(filesToRemove);
      if (!removeError) {
        deleted += filesToRemove.length;
      } else {
        console.error('Storage remove error:', removeError);
      }
    }

    // Recurse into subfolders
    for (const folder of foldersToRecurse) {
      await listAndDelete(folder);
    }

    // Handle pagination if we got exactly batchSize items (there might be more)
    if (items.length === batchSize) {
      // Simple approach: list with higher offset (Supabase list doesn't have perfect cursor here, but works for our scale)
      let offset = batchSize;
      while (true) {
        const { data: moreItems } = await admin.storage.from(bucket).list(currentPrefix, {
          limit: batchSize,
          offset,
        });
        if (!moreItems || moreItems.length === 0) break;

        const moreFiles = moreItems
          .filter((i) => i.id !== null || i.metadata !== null)
          .map((i) => (currentPrefix ? `${currentPrefix}${i.name}` : i.name));

        if (moreFiles.length > 0) {
          const { error: removeError } = await admin.storage.from(bucket).remove(moreFiles);
          if (!removeError) deleted += moreFiles.length;
        }
        offset += batchSize;
        if (moreItems.length < batchSize) break;
      }
    }
  }

  await listAndDelete(prefix);
  return deleted;
}
