'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Cloud,
  Download,
  Plus,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailyReport {
  id: string;
  report_date: string;
  weather_summary: string | null;
  weather_data: Record<string, unknown> | null;
  workforce_count: number | null;
  activities: string | null;
  plant_on_site: string | null;
  delays: string | null;
  safety_observations: string | null;
  visitors: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(s: string) {
  if (s === 'approved') return <Badge variant="default">Approved</Badge>;
  if (s === 'submitted') return <Badge variant="secondary">Submitted</Badge>;
  return <Badge variant="secondary">Draft</Badge>;
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Create form ───────────────────────────────────────────────────────────────

function CreateReportForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: () => void;
}) {
  const [date, setDate] = useState(todayStr());
  const [workforce, setWorkforce] = useState('');
  const [activities, setActivities] = useState('');
  const [plant, setPlant] = useState('');
  const [delays, setDelays] = useState('');
  const [safety, setSafety] = useState('');
  const [visitors, setVisitors] = useState('');
  const [weatherOverride, setWeatherOverride] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/daily-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportDate: date,
          workforceCount: workforce ? parseInt(workforce, 10) : undefined,
          activities: activities.trim() || undefined,
          plantOnSite: plant.trim() || undefined,
          delays: delays.trim() || undefined,
          safetyObservations: safety.trim() || undefined,
          visitors: visitors.trim() || undefined,
          weatherSummary: weatherOverride.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed');
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
      <h4 className="text-sm font-medium">New Daily Report</h4>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="text-xs text-muted-foreground">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Workforce count</label>
          <Input type="number" min="0" placeholder="0" value={workforce} onChange={(e) => setWorkforce(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Weather (leave blank for auto)</label>
          <Input placeholder="e.g. Sunny, 18°C" value={weatherOverride} onChange={(e) => setWeatherOverride(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Activities</label>
        <textarea className="w-full rounded border bg-background px-3 py-2 text-sm" rows={2} placeholder="Summary of work done today" value={activities} onChange={(e) => setActivities(e.target.value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Plant & equipment on site</label>
          <textarea className="w-full rounded border bg-background px-3 py-2 text-sm" rows={2} value={plant} onChange={(e) => setPlant(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Delays / issues</label>
          <textarea className="w-full rounded border bg-background px-3 py-2 text-sm" rows={2} value={delays} onChange={(e) => setDelays(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Safety observations</label>
          <textarea className="w-full rounded border bg-background px-3 py-2 text-sm" rows={2} value={safety} onChange={(e) => setSafety(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Visitors</label>
          <textarea className="w-full rounded border bg-background px-3 py-2 text-sm" rows={2} value={visitors} onChange={(e) => setVisitors(e.target.value)} />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Report'}</Button>
    </form>
  );
}

// ── Report detail ─────────────────────────────────────────────────────────────

function ReportDetail({ projectId, report }: { projectId: string; report: DailyReport }) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/daily-reports/${report.id}?format=pdf`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Daily-Report-${report.report_date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Weather */}
      {report.weather_summary && (
        <div className="flex items-center gap-2 rounded bg-blue-50 px-3 py-2 text-blue-800 text-xs">
          <Cloud className="h-4 w-4" />
          {report.weather_summary}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 text-xs">
        {report.workforce_count != null && (
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <strong>{report.workforce_count}</strong> on site
          </div>
        )}
      </div>

      {report.activities && <div><strong className="text-xs">Activities:</strong> <span className="text-xs">{report.activities}</span></div>}
      {report.plant_on_site && <div><strong className="text-xs">Plant:</strong> <span className="text-xs">{report.plant_on_site}</span></div>}
      {report.delays && <div className="rounded bg-yellow-50 px-2 py-1 text-xs text-yellow-800"><strong>Delays:</strong> {report.delays}</div>}
      {report.safety_observations && <div className="rounded bg-red-50 px-2 py-1 text-xs text-red-800"><strong>Safety:</strong> {report.safety_observations}</div>}
      {report.visitors && <div><strong className="text-xs">Visitors:</strong> <span className="text-xs">{report.visitors}</span></div>}
      {report.notes && <div><strong className="text-xs">Notes:</strong> <span className="text-xs">{report.notes}</span></div>}

      <Button variant="outline" size="sm" onClick={handleDownload} disabled={downloading}>
        <Download className="mr-1.5 h-3.5 w-3.5" />
        {downloading ? 'Generating…' : 'Download PDF'}
      </Button>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function DailyReportsTab({ projectId }: { projectId: string }) {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/daily-reports`);
      if (res.ok) setReports(await res.json() as DailyReport[]);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [projectId]);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (!loadedRef.current) { loadedRef.current = true; void load(); }
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Daily Reports
          </CardTitle>
          <CardDescription>Site activity, weather, and workforce records.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1 h-4 w-4" /> New Report
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {showCreate && (
          <CreateReportForm projectId={projectId} onCreated={() => { setShowCreate(false); void load(); }} />
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : reports.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No daily reports yet. Create one to start tracking site activity.
          </p>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => {
              const isExpanded = expandedId === r.id;
              return (
                <div key={r.id} className="rounded-lg border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{fmtDate(r.report_date)}</span>
                        {statusBadge(r.status)}
                        {r.workforce_count != null && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" /> {r.workforce_count}
                          </span>
                        )}
                      </div>
                      {r.weather_summary && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Cloud className="h-3 w-3" /> {r.weather_summary}
                        </div>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t px-4 pb-4 pt-3">
                      <ReportDetail projectId={projectId} report={r} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
