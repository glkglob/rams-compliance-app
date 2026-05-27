import { NextResponse } from 'next/server';

import { createServerSupabaseWithTimeout } from '@/lib/db/supabase-with-timeout';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { createAuditLog } from '@/lib/audit/audit-log';
import { logger } from '@/lib/logging';

/**
 * Account deletion with soft-delete recovery window.
 *
 * Phase 1 (immediate): Marks the profile as `deleted_at = now()` and
 *   `scheduled_hard_delete_at = now() + 30 days`. The user is signed out.
 *   All their data remains intact for 30 days.
 *
 * Phase 2 (cron / manual): A scheduled job or admin action runs the hard-
 *   delete for accounts past their retention window.  See `hardDeleteAccount()`.
 *
 * The user can request cancellation during the recovery window by contacting
 * support — an admin clears the `deleted_at` / `scheduled_hard_delete_at` fields.
 */

const RECOVERY_WINDOW_DAYS = 30;

// -------------------------------------------------------------------------
// DELETE /api/account — soft-delete (sets deletion schedule)
// -------------------------------------------------------------------------

export async function DELETE(request: Request) {
  try {
    const supabase = await createServerSupabaseWithTimeout(8000);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;

    // Require explicit confirmation from the client.
    const body = await request.json().catch(() => ({}));
    const confirmed = body?.confirmed === true;

    if (!confirmed) {
      return NextResponse.json(
        {
          error: 'Confirmation required',
          message:
            'Send { "confirmed": true } to schedule your account for deletion. ' +
            `Your data will be retained for ${RECOVERY_WINDOW_DAYS} days before permanent removal.`,
        },
        { status: 400 },
      );
    }

    const admin = getSupabaseAdmin();

    // --- Check for owned projects and warn the user ---
    const { data: ownedProjects } = await admin
      .from('projects')
      .select('id, name')
      .eq('created_by', userId);

    const projectCount = ownedProjects?.length ?? 0;

    // --- Soft-delete: mark the profile ---
    const now = new Date();
    const hardDeleteAt = new Date(now.getTime() + RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const { error: updateError } = await admin
      .from('profiles')
      .update({
        deleted_at: now.toISOString(),
        scheduled_hard_delete_at: hardDeleteAt.toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      logger.error('Failed to soft-delete profile', { userId, error: String(updateError) });
      return NextResponse.json({ error: 'Failed to schedule account deletion' }, { status: 500 });
    }

    // If the user owns projects, mark them as pending deletion.
    if (projectCount > 0) {
      const { error: projectUpdateError } = await admin
        .from('projects')
        .update({ status: 'pending_deletion' })
        .eq('created_by', userId);

      if (projectUpdateError) {
        logger.warn('Failed to mark owned projects as pending_deletion', {
          userId,
          error: String(projectUpdateError),
        });
      }
    }

    // Audit
    await createAuditLog('SOFT_DELETE_ACCOUNT', 'profile', userId, {
      userId,
      details: {
        scheduledHardDeleteAt: hardDeleteAt.toISOString(),
        ownedProjectCount: projectCount,
      },
    });

    // Sign the user out — their session is no longer valid.
    try {
      await supabase.auth.signOut();
    } catch {
      // Non-fatal — the profile is already marked for deletion.
    }

    logger.info('Account soft-deleted', {
      userId,
      scheduledHardDeleteAt: hardDeleteAt.toISOString(),
      ownedProjectCount: projectCount,
    });

    return NextResponse.json(
      {
        success: true,
        message:
          `Your account has been scheduled for permanent deletion on ${hardDeleteAt.toISOString().slice(0, 10)}. ` +
          `During the ${RECOVERY_WINDOW_DAYS}-day recovery window you can contact support to cancel.`,
        scheduledHardDeleteAt: hardDeleteAt.toISOString(),
        ownedProjectsMarkedPendingDeletion: projectCount,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error('Account deletion error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: 'Account deletion failed',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 },
    );
  }
}

// -------------------------------------------------------------------------
// Hard-delete — called by cron job or admin action for accounts past their
// recovery window.  NOT exposed as a public API route.
// -------------------------------------------------------------------------

export async function hardDeleteAccount(userId: string): Promise<{ success: boolean; error?: string }> {
  const admin = getSupabaseAdmin();

  try {
    // 1. Find and delete storage objects for owned projects
    const { data: ownedProjects } = await admin
      .from('projects')
      .select('id')
      .eq('created_by', userId);

    let storageObjectsDeleted = 0;

    for (const project of (ownedProjects as { id: string }[] | null) ?? []) {
      const count = await deleteAllStorageObjects(admin, 'documents', `${project.id}/`);
      storageObjectsDeleted += count;
    }

    // 2. Delete RAMS storage for non-owned submissions
    const { data: submittedRams } = await admin
      .from('rams_submissions')
      .select('id, storage_path')
      .eq('submitted_by', userId);

    for (const rams of (submittedRams as { id: string; storage_path: string | null }[] | null) ?? []) {
      if (rams.storage_path) {
        await admin.storage.from('documents').remove([rams.storage_path]);
        storageObjectsDeleted++;
      }
    }

    // 3. Delete owned projects (DB cascades handle children)
    if (ownedProjects && ownedProjects.length > 0) {
      await admin
        .from('projects')
        .delete()
        .eq('created_by', userId);
    }

    // 4. Delete non-owned RAMS submissions
    await admin
      .from('rams_submissions')
      .delete()
      .eq('submitted_by', userId);

    // 5. Remove project memberships
    await admin
      .from('project_members')
      .delete()
      .eq('user_id', userId);

    // 6. Delete audit logs (right to erasure)
    await admin
      .from('audit_logs')
      .delete()
      .eq('user_id', userId);

    // 7. Delete profile
    await admin
      .from('profiles')
      .delete()
      .eq('id', userId);

    // 8. Delete auth user (irreversible)
    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) {
      logger.error('Hard delete: auth user deletion failed', { userId, error: String(authError) });
      return { success: false, error: `Auth deletion failed: ${authError.message}` };
    }

    logger.info('Account hard-deleted', { userId, storageObjectsDeleted });

    await createAuditLog('HARD_DELETE_ACCOUNT', 'profile', userId, {
      details: { storageObjectsDeleted },
    });

    return { success: true };
  } catch (error) {
    logger.error('Hard delete error', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Hard delete failed',
    };
  }
}

// -------------------------------------------------------------------------
// Storage helpers (unchanged logic, structured logging)
// -------------------------------------------------------------------------

async function deleteAllStorageObjects(
  admin: ReturnType<typeof getSupabaseAdmin>,
  bucket: string,
  prefix: string,
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
      logger.error('Storage list error during account deletion', {
        prefix: currentPrefix,
        error: error ? String(error) : 'no items',
      });
      return;
    }

    const filesToRemove: string[] = [];
    const foldersToRecurse: string[] = [];

    for (const item of items) {
      const fullPath = currentPrefix ? `${currentPrefix}${item.name}` : item.name;

      if (item.id === null && item.metadata === null) {
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
        logger.error('Storage remove error during account deletion', { error: String(removeError) });
      }
    }

    for (const folder of foldersToRecurse) {
      await listAndDelete(folder);
    }

    if (items.length === batchSize) {
      let offset = batchSize;
      while (true) {
        const { data: moreItems } = await admin.storage.from(bucket).list(currentPrefix, {
          limit: batchSize,
          offset,
        });
        if (!moreItems || moreItems.length === 0) break;

        const moreFiles = moreItems
          .filter((i: { id: string | null; metadata: any; name: string }) => i.id !== null || i.metadata !== null)
          .map((i: { name: string }) => (currentPrefix ? `${currentPrefix}${i.name}` : i.name));

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
