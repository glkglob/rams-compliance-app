'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Award, Calendar, Plus, Trash2, AlertTriangle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Certification {
  id: string;
  name: string;
  issuing_body: string | null;
  certificate_number: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function expiryStatus(expiryDate: string | null): { label: string; variant: 'destructive' | 'secondary' | 'default' } {
  if (!expiryDate) return { label: 'No expiry', variant: 'secondary' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);

  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: 'Expired', variant: 'destructive' };
  if (diffDays <= 30) return { label: `${diffDays}d left`, variant: 'destructive' };
  if (diffDays <= 90) return { label: `${diffDays}d left`, variant: 'secondary' };
  return { label: 'Valid', variant: 'default' };
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Add form ──────────────────────────────────────────────────────────────────

function AddCertForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [issuingBody, setIssuingBody] = useState('');
  const [certNumber, setCertNumber] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          issuingBody: issuingBody.trim() || undefined,
          certificateNumber: certNumber.trim() || undefined,
          issuedDate: issuedDate || undefined,
          expiryDate: expiryDate || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed');
      }

      setName(''); setIssuingBody(''); setCertNumber(''); setIssuedDate(''); setExpiryDate('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-4">
      <div className="text-sm font-medium">Add Certification</div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Certification name *" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Issuing body (e.g. CITB)" value={issuingBody} onChange={(e) => setIssuingBody(e.target.value)} />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Input placeholder="Certificate number" value={certNumber} onChange={(e) => setCertNumber(e.target.value)} />
        <div>
          <label className="text-xs text-muted-foreground">Issued</label>
          <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Expires</label>
          <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button type="submit" size="sm" disabled={saving}>
        {saving ? 'Adding…' : 'Add Certification'}
      </Button>
    </form>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export function CertificationsCard() {
  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/certifications');
      if (res.ok) setCerts(await res.json() as Certification[]);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (!loadedRef.current) { loadedRef.current = true; void load(); }
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this certification?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/certifications/${id}`, { method: 'DELETE' });
      if (res.ok) setCerts((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  /* eslint-disable react-hooks/purity */
  const expiringSoon = certs.filter((c) => {
    const now = Date.now();
    if (!c.expiry_date) return false;
    const diff = (new Date(c.expiry_date).getTime() - now) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  });
  /* eslint-enable react-hooks/purity */

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" /> Certifications
          </CardTitle>
          <CardDescription>
            Track your trade and safety certifications. You&apos;ll receive email reminders before they expire.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Expiry warning */}
        {expiringSoon.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {expiringSoon.length} certification{expiringSoon.length > 1 ? 's' : ''} expiring within 30 days
          </div>
        )}

        {showAdd && <AddCertForm onAdded={() => { setShowAdd(false); void load(); }} />}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : certs.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No certifications added yet.
          </p>
        ) : (
          <div className="space-y-2">
            {certs.map((cert) => {
              const status = expiryStatus(cert.expiry_date);
              return (
                <div key={cert.id} className="flex items-center gap-3 rounded-md border px-3 py-2.5">
                  <Award className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{cert.name}</span>
                      <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {cert.issuing_body && `${cert.issuing_body} · `}
                      {cert.certificate_number && `#${cert.certificate_number} · `}
                      <Calendar className="mr-0.5 inline h-3 w-3" />
                      {cert.expiry_date ? fmtDate(cert.expiry_date) : 'No expiry'}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={deletingId === cert.id}
                    onClick={() => handleDelete(cert.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
