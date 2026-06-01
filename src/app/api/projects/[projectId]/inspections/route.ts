import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { createAuditLog } from '@/lib/audit/audit-log';
import { canManageProject } from '@/lib/auth/permissions';
import {
  handleAPIError,
  UnauthorizedError,
  validationErrorResponse,
} from '@/lib/error-handling';
import { setSentryContext } from '@/lib/observability/sentry-context';
import { withRequestContext } from '@/lib/request-context';
import { logger } from '@/lib/logging';

type Context = { params: Promise<{ projectId: string }> };

// ── Schemas ───────────────────────────────────────────────────────────────────

const templateItemSchema = z.object({
  label: z.string().min(1),
  category: z.string().optional(),
  required: z.boolean().optional().default(true),
});

const createInspectionSchema = z.object({
  templateId: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  location: z.string().optional(),
  /** Direct items when not using a template */
  items: z.array(templateItemSchema).optional(),
});

// ── GET — list inspections for project ─────────────────────────────────────────

async function getInspections(_request: Request, { params }: Context) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const canManage = await canManageProject(projectId);
    if (!canManage) {
      // Also check membership for non-managers
      const { data: membership } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .single();
      if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('inspections')
      .select('*, inspection_items (id, item_index, label, category, result, notes)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list inspections', { projectId, error: error.message });
      return NextResponse.json({ error: 'Failed to load inspections' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    return handleAPIError(error);
  }
}

// ── POST — create inspection ───────────────────────────────────────────────────

async function postInspection(request: Request, { params }: Context) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    // Must be a project member to create
    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single();

    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    setSentryContext({ userId: user.id, projectId });

    const body = await request.json();
    const parsed = createInspectionSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.issues);

    const { templateId, title, description, location, items: directItems } = parsed.data;

    // Resolve checklist items: from template or from request body
    let checklistItems: Array<{ label: string; category?: string; required?: boolean }> = [];

    if (templateId) {
      const { data: template } = await supabase
        .from('inspection_templates')
        .select('items')
        .eq('id', templateId)
        .eq('project_id', projectId)
        .single();

      if (template?.items && Array.isArray(template.items)) {
        checklistItems = template.items as typeof checklistItems;
      }
    }

    if (checklistItems.length === 0 && directItems?.length) {
      checklistItems = directItems;
    }

    // Insert inspection
    const { data: inspection, error: insertError } = await supabase
      .from('inspections')
      .insert({
        project_id: projectId,
        template_id: templateId ?? null,
        title,
        description: description ?? null,
        location: location ?? null,
        inspector_id: user.id,
        status: 'draft',
      })
      .select()
      .single();

    if (insertError || !inspection) {
      logger.error('Failed to create inspection', { error: insertError?.message });
      return NextResponse.json({ error: 'Failed to create inspection' }, { status: 500 });
    }

    // Insert checklist items
    if (checklistItems.length > 0) {
      const { error: itemsError } = await supabase.from('inspection_items').insert(
        checklistItems.map((item, i) => ({
          inspection_id: inspection.id,
          item_index: i,
          label: item.label,
          category: item.category ?? null,
          result: 'not_checked',
        })),
      );

      if (itemsError) {
        logger.error('Failed to insert inspection items', { error: itemsError.message });
      }
    }

    await createAuditLog('CREATE_INSPECTION', 'inspection', inspection.id, {
      userId: user.id,
      details: { title, templateId, itemCount: checklistItems.length },
    }).catch(() => {});

    return NextResponse.json(inspection, { status: 201 });
  } catch (error) {
    return handleAPIError(error);
  }
}

export const GET = withRequestContext(getInspections, '/api/projects/[projectId]/inspections');
export const POST = withRequestContext(postInspection, '/api/projects/[projectId]/inspections');
