import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/db/supabase-server';
import { createAuditLog } from '@/lib/audit/audit-log';
import { handleAPIError, UnauthorizedError, ForbiddenError, validationErrorResponse } from '@/lib/error-handling';
import { setSentryContext } from '@/lib/observability/sentry-context';
import { withRequestContext } from '@/lib/request-context';
import { fetchWeatherByLocation, manualWeather } from '@/lib/weather/met-office';
import { canViewProject, isAdmin } from '@/lib/auth/permissions';
import { logger } from '@/lib/logging';

type Context = { params: Promise<{ projectId: string }> };

const createReportSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  workforceCount: z.number().int().min(0).optional(),
  activities: z.string().optional(),
  plantOnSite: z.string().optional(),
  delays: z.string().optional(),
  safetyObservations: z.string().optional(),
  visitors: z.string().optional(),
  notes: z.string().optional(),
  weatherSummary: z.string().optional(), // manual override
});

// ── GET ────────────────────────────────────────────────────────────────────────

async function getReports(_request: Request, { params }: Context) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const canView = await canViewProject(projectId);
    const admin = await isAdmin();
    if (!canView && !admin) {
      throw new ForbiddenError();
    }

    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('report_date', { ascending: false })
      .limit(60);

    if (error) {
      logger.error('Failed to list daily reports', { error: error.message });
      return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    return handleAPIError(error);
  }
}

// ── POST ───────────────────────────────────────────────────────────────────────

async function postReport(request: Request, { params }: Context) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabase();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UnauthorizedError();

    const canView = await canViewProject(projectId);
    if (!canView) {
      throw new ForbiddenError();
    }

    setSentryContext({ userId: user.id, projectId });

    const body = await request.json();
    const parsed = createReportSchema.safeParse(body);
    if (!parsed.success) return validationErrorResponse(parsed.error.issues);

    const { reportDate, workforceCount, activities, plantOnSite, delays,
            safetyObservations, visitors, notes, weatherSummary } = parsed.data;

    // Fetch weather from Met Office using the project's site address
    let weatherData = null;
    let weatherSummaryFinal = weatherSummary ?? null;

    const { data: project } = await supabase
      .from('projects').select('site_address').eq('id', projectId).single();

    if (project?.site_address && !weatherSummary) {
      weatherData = await fetchWeatherByLocation(project.site_address);
      if (weatherData) {
        weatherSummaryFinal = [
          weatherData.description,
          weatherData.temp_c != null ? `${weatherData.temp_c}°C` : null,
          weatherData.wind_mph != null ? `Wind ${weatherData.wind_mph} mph` : null,
        ].filter(Boolean).join(', ');
      }
    }

    // If user provided a manual summary but no API weather
    if (weatherSummary && !weatherData) {
      weatherData = manualWeather(weatherSummary);
    }

    const { data: report, error: insertError } = await supabase
      .from('daily_reports')
      .insert({
        project_id: projectId,
        report_date: reportDate,
        weather_data: weatherData,
        weather_summary: weatherSummaryFinal,
        workforce_count: workforceCount ?? null,
        activities: activities ?? null,
        plant_on_site: plantOnSite ?? null,
        delays: delays ?? null,
        safety_observations: safetyObservations ?? null,
        visitors: visitors ?? null,
        notes: notes ?? null,
        status: 'draft',
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'A report already exists for this date' }, { status: 409 });
      }
      logger.error('Failed to create daily report', { error: insertError.message });
      return NextResponse.json({ error: 'Failed to create report' }, { status: 500 });
    }

    await createAuditLog('CREATE_DAILY_REPORT', 'daily_report', report.id, {
      userId: user.id,
      details: { reportDate, weatherSource: weatherData?.source },
    });

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    return handleAPIError(error);
  }
}

export const GET = withRequestContext(getReports, '/api/projects/[projectId]/daily-reports');
export const POST = withRequestContext(postReport, '/api/projects/[projectId]/daily-reports');
