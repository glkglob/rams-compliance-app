'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Plus,
  ShieldAlert,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

// ── Types ─────────────────────────────────────────────────────────────────────

interface IncidentParty {
  id: string;
  role: string;
  full_name: string;
  company: string | null;
  contact: string | null;
}

interface Incident {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  occurred_at: string;
  location: string | null;
  riddor_reportable: boolean;
  riddor_reference: string | null;
  root_cause: string | null;
  corrective_actions: string | null;
  related_rams_submission_id: string | null;
  created_at: string;
  incident_parties: IncidentParty[];
}

interface RAMSOption {
  id: string;
  subcontractor_name: string;
  file_name: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function severityBadge(s: string) {
  const variant = ['fatality', 'specified_injury', 'dangerous_occurrence'].includes(s) ? 'destructive' as const : s === 'major' ? 'destructive' as const : 'secondary' as const;
  return <Badge variant={variant}>{s.replace(/_/g, ' ')}</Badge>;
}

function statusBadge(s: string) {
  if (s === 'closed') return <Badge variant="default">Closed</Badge>;
  if (s === 'riddor_notified') return <Badge variant="destructive">RIDDOR</Badge>;
  return <Badge variant="secondary">{s.replace(/_/g, ' ')}</Badge>;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Create form ───────────────────────────────────────────────────────────────

function CreateIncidentForm({
  projectId,
  ramsOptions,
  onCreated,
}: {
  projectId: string;
  ramsOptions: RAMSOption[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('near_miss');
  const [location, setLocation] = useState('');
  const [relatedRams, setRelatedRams] = useState('');
  const [riddor, setRiddor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Party fields
  const [partyName, setPartyName] = useState('');
  const [partyRole, setPartyRole] = useState('injured_person');
  const [parties, setParties] = useState<Array<{ role: string; full_name: string }>>([]);

  function addParty() {
    if (!partyName.trim()) return;
    setParties([...parties, { role: partyRole, full_name: partyName.trim() }]);
    setPartyName('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/incidents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          severity,
          location: location.trim() || undefined,
          relatedRamsSubmissionId: relatedRams || undefined,
          riddorReportable: riddor,
          parties: parties.length > 0 ? parties : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to create');
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-destructive" /> Report Incident
      </h4>

      <Input placeholder="Incident title *" value={title} onChange={(e) => setTitle(e.target.value)} />

      <textarea
        placeholder="What happened? Include as much detail as possible."
        className="w-full rounded border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="text-xs text-muted-foreground">Severity</label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-full rounded border bg-background px-2 py-1.5 text-sm">
            <option value="near_miss">Near Miss</option>
            <option value="minor">Minor</option>
            <option value="major">Major (7+ day)</option>
            <option value="specified_injury">Specified Injury</option>
            <option value="dangerous_occurrence">Dangerous Occurrence</option>
            <option value="fatality">Fatality</option>
          </select>
        </div>

        <Input placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />

        <div>
          <label className="text-xs text-muted-foreground">Related RAMS</label>
          <select value={relatedRams} onChange={(e) => setRelatedRams(e.target.value)} className="w-full rounded border bg-background px-2 py-1.5 text-sm">
            <option value="">None</option>
            {ramsOptions.map((r) => (
              <option key={r.id} value={r.id}>{r.subcontractor_name} — {r.file_name}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={riddor} onChange={(e) => setRiddor(e.target.checked)} />
        RIDDOR reportable
      </label>

      {/* Parties */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Involved Parties</div>
        {parties.map((p, i) => (
          <div key={i} className="text-xs text-muted-foreground">
            {p.role.replace(/_/g, ' ')}: {p.full_name}
          </div>
        ))}
        <div className="flex gap-2">
          <select value={partyRole} onChange={(e) => setPartyRole(e.target.value)} className="rounded border bg-background px-2 py-1 text-sm">
            <option value="injured_person">Injured Person</option>
            <option value="witness">Witness</option>
            <option value="first_aider">First Aider</option>
            <option value="reporter">Reporter</option>
          </select>
          <Input placeholder="Full name" value={partyName} onChange={(e) => setPartyName(e.target.value)} className="flex-1" />
          <Button type="button" variant="outline" size="sm" onClick={addParty}>Add</Button>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button type="submit" disabled={saving}>{saving ? 'Reporting…' : 'Report Incident'}</Button>
    </form>
  );
}

// ── Detail view ───────────────────────────────────────────────────────────────

function IncidentDetail({ projectId, incident }: { projectId: string; incident: Incident }) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/incidents/${incident.id}/report`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Incident-Report.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      {incident.description && <p>{incident.description}</p>}

      <div className="grid gap-2 sm:grid-cols-2 text-xs">
        <div><strong>Date:</strong> {fmtDate(incident.occurred_at)}</div>
        <div><strong>Location:</strong> {incident.location ?? '—'}</div>
        <div><strong>RIDDOR:</strong> {incident.riddor_reportable ? `Yes${incident.riddor_reference ? ` (${incident.riddor_reference})` : ''}` : 'No'}</div>
        {incident.related_rams_submission_id && (
          <div><strong>Linked RAMS:</strong> <a href={`/rams/${incident.related_rams_submission_id}`} className="text-primary hover:underline">View RAMS</a></div>
        )}
      </div>

      {incident.root_cause && (
        <div className="rounded bg-muted p-2 text-xs">
          <strong>Root Cause:</strong> {incident.root_cause}
        </div>
      )}

      {incident.corrective_actions && (
        <div className="rounded bg-muted p-2 text-xs">
          <strong>Corrective Actions:</strong> {incident.corrective_actions}
        </div>
      )}

      {incident.incident_parties.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1">Involved Parties</div>
          {incident.incident_parties.map((p) => (
            <div key={p.id} className="text-xs text-muted-foreground">
              {p.role.replace(/_/g, ' ')}: {p.full_name}{p.company ? ` (${p.company})` : ''}
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={handleDownload} disabled={downloading}>
        <Download className="mr-1.5 h-3.5 w-3.5" />
        {downloading ? 'Generating…' : 'Download PDF Report'}
      </Button>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function IncidentsTab({ projectId }: { projectId: string }) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [ramsOptions, setRamsOptions] = useState<RAMSOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [incRes, ramsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/incidents`),
        fetch(`/api/projects/${projectId}/rams`),
      ]);
      if (incRes.ok) setIncidents(await incRes.json() as Incident[]);
      if (ramsRes.ok) setRamsOptions(await ramsRes.json() as RAMSOption[]);
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
            <AlertTriangle className="h-5 w-5 text-destructive" /> Incidents
          </CardTitle>
          <CardDescription>RIDDOR-aligned incident reports linked to project RAMS.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1 h-4 w-4" /> Report Incident
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {showCreate && (
          <CreateIncidentForm
            projectId={projectId}
            ramsOptions={ramsOptions}
            onCreated={() => { setShowCreate(false); void load(); }}
          />
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : incidents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No incidents reported. Use the button above to report one.
          </p>
        ) : (
          <div className="space-y-2">
            {incidents.map((inc) => {
              const isExpanded = expandedId === inc.id;
              return (
                <div key={inc.id} className="rounded-lg border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : inc.id)}
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{inc.title}</span>
                        {severityBadge(inc.severity)}
                        {statusBadge(inc.status)}
                        {inc.riddor_reportable && <Badge variant="destructive" className="text-[10px]">RIDDOR</Badge>}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {inc.location && `${inc.location} · `}
                        {fmtDate(inc.occurred_at)}
                        {inc.incident_parties.length > 0 && ` · ${inc.incident_parties.length} parties`}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t px-4 pb-4 pt-3">
                      <IncidentDetail projectId={projectId} incident={inc} />
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
