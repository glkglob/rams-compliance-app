'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Minus,
  Plus,
  X,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

// ── Types ─────────────────────────────────────────────────────────────────────

interface InspectionItem {
  id: string;
  item_index: number;
  label: string;
  category: string | null;
  result: 'pass' | 'fail' | 'na' | 'not_checked';
  notes: string | null;
}

interface Attachment {
  id: string;
  file_name: string;
  mime_type: string;
  url: string | null;
}

interface Inspection {
  id: string;
  title: string;
  description: string | null;
  status: string;
  location: string | null;
  completed_at: string | null;
  created_at: string;
  inspection_items: InspectionItem[];
  attachments?: Attachment[];
}

interface InspectionsTabProps {
  projectId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case 'completed': return <Badge variant="default">Completed</Badge>;
    case 'in_progress': return <Badge variant="secondary">In Progress</Badge>;
    case 'failed': return <Badge variant="destructive">Failed</Badge>;
    default: return <Badge variant="secondary">Draft</Badge>;
  }
}

const RESULT_ICONS: Record<string, React.ReactNode> = {
  pass:        <CheckCircle className="h-4 w-4 text-green-600" />,
  fail:        <XCircle className="h-4 w-4 text-destructive" />,
  na:          <Minus className="h-4 w-4 text-muted-foreground" />,
  not_checked: <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />,
};

// ── Create inspection form ────────────────────────────────────────────────────

function CreateInspectionForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [items, setItems] = useState([{ label: '', category: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addItem() {
    setItems([...items, { label: '', category: '' }]);
  }

  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  function updateItem(i: number, field: 'label' | 'category', value: string) {
    const copy = [...items];
    copy[i] = { ...copy[i], [field]: value };
    setItems(copy);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }

    const validItems = items.filter((it) => it.label.trim());
    if (validItems.length === 0) { setError('Add at least one checklist item'); return; }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/inspections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          location: location.trim() || undefined,
          items: validItems.map((it) => ({ label: it.label.trim(), category: it.category.trim() || undefined })),
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to create');
      }

      setTitle('');
      setLocation('');
      setItems([{ label: '', category: '' }]);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
      <h4 className="text-sm font-medium">New Inspection</h4>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Inspection title *" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Checklist Items</div>
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <Input
              placeholder={`Item ${i + 1} label *`}
              value={item.label}
              onChange={(e) => updateItem(i, 'label', e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Category"
              value={item.category}
              onChange={(e) => updateItem(i, 'category', e.target.value)}
              className="w-32"
            />
            {items.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(i)}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="mr-1 h-3 w-3" /> Add Item
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button type="submit" disabled={saving}>
        {saving ? 'Creating…' : 'Create Inspection'}
      </Button>
    </form>
  );
}

// ── Inspection detail (conduct / review) ──────────────────────────────────────

function InspectionDetail({
  projectId,
  inspection,
  onUpdated,
}: {
  projectId: string;
  inspection: Inspection;
  onUpdated: () => void;
}) {
  const [localItems, setLocalItems] = useState(inspection.inspection_items);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>(inspection.attachments ?? []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function setResult(itemId: string, result: InspectionItem['result']) {
    setLocalItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, result } : it)),
    );
  }

  async function handleSave(newStatus?: string) {
    setSaving(true);
    try {
      const changedItems = localItems.filter((local) => {
        const orig = inspection.inspection_items.find((o) => o.id === local.id);
        return orig && (orig.result !== local.result || orig.notes !== local.notes);
      });

      await fetch(`/api/projects/${projectId}/inspections/${inspection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          items: changedItems.map((it) => ({
            id: it.id,
            result: it.result,
            notes: it.notes,
          })),
        }),
      });

      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoUpload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);

      const res = await fetch(`/api/projects/${projectId}/inspections/${inspection.id}`, {
        method: 'POST',
        body,
      });

      if (res.ok) {
        const att = await res.json() as Attachment;
        setAttachments((prev) => [att, ...prev]);
      }
    } finally {
      setUploading(false);
    }
  }

  const passCount = localItems.filter((it) => it.result === 'pass').length;
  const failCount = localItems.filter((it) => it.result === 'fail').length;
  const total = localItems.length;
  const isComplete = localItems.every((it) => it.result !== 'not_checked');

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-green-600 font-medium">{passCount} pass</span>
        <span className="text-destructive font-medium">{failCount} fail</span>
        <span className="text-muted-foreground">{total - passCount - failCount - localItems.filter(it => it.result === 'na').length} remaining</span>
      </div>

      {/* Checklist */}
      <div className="space-y-1">
        {localItems
          .sort((a, b) => a.item_index - b.item_index)
          .map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
              {RESULT_ICONS[item.result]}
              <span className="flex-1 text-sm">{item.label}</span>
              {item.category && (
                <span className="text-xs text-muted-foreground">{item.category}</span>
              )}
              <div className="flex gap-1">
                <button
                  type="button"
                  className={`rounded px-2 py-0.5 text-xs ${item.result === 'pass' ? 'bg-green-100 text-green-800 font-medium' : 'hover:bg-muted'}`}
                  onClick={() => setResult(item.id, 'pass')}
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className={`rounded px-2 py-0.5 text-xs ${item.result === 'fail' ? 'bg-red-100 text-red-800 font-medium' : 'hover:bg-muted'}`}
                  onClick={() => setResult(item.id, 'fail')}
                >
                  <X className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className={`rounded px-2 py-0.5 text-xs ${item.result === 'na' ? 'bg-muted font-medium' : 'hover:bg-muted'}`}
                  onClick={() => setResult(item.id, 'na')}
                >
                  N/A
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* Photos */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Camera className="mr-1.5 h-4 w-4" />
          {uploading ? 'Uploading…' : 'Add Photo'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePhotoUpload(f); e.target.value = ''; }}
        />
        {attachments.length > 0 && (
          <span className="text-xs text-muted-foreground">{attachments.length} photo(s)</span>
        )}
      </div>

      {/* Photo thumbnails */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.filter((a) => a.mime_type.startsWith('image/')).map((a) => (
            a.url ? (
              <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.file_name} className="h-16 w-16 rounded object-cover border" />
              </a>
            ) : null
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button size="sm" onClick={() => handleSave('in_progress')} disabled={saving}>
          {saving ? 'Saving…' : 'Save Progress'}
        </Button>
        {isComplete && (
          <Button size="sm" variant="default" onClick={() => handleSave('completed')} disabled={saving}>
            Complete Inspection
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function InspectionsTab({ projectId }: InspectionsTabProps) {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadInspections = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/inspections`);
      if (res.ok) setInspections(await res.json() as Inspection[]);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [projectId]);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (!loadedRef.current) { loadedRef.current = true; void loadInspections(); }
  }, [loadInspections]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> Inspections
          </CardTitle>
          <CardDescription>Site inspections and safety checklists.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1 h-4 w-4" /> New Inspection
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {showCreate && (
          <CreateInspectionForm
            projectId={projectId}
            onCreated={() => { setShowCreate(false); void loadInspections(); }}
          />
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : inspections.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No inspections yet. Create one to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {inspections.map((insp) => {
              const isExpanded = expandedId === insp.id;
              const pass = insp.inspection_items.filter((i) => i.result === 'pass').length;
              const total = insp.inspection_items.length;

              return (
                <div key={insp.id} className="rounded-lg border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : insp.id)}
                  >
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4 shrink-0" />
                      : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{insp.title}</span>
                        {statusBadge(insp.status)}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {insp.location && `${insp.location} · `}
                        {pass}/{total} passed ·{' '}
                        {new Date(insp.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t px-4 pb-4 pt-3">
                      <InspectionDetail
                        projectId={projectId}
                        inspection={insp}
                        onUpdated={() => void loadInspections()}
                      />
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
