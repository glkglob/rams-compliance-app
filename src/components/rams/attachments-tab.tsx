'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileImage, FileText, Paperclip, Trash2, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Attachment {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string | null;
  created_at: string;
  url: string | null;
}

interface AttachmentsTabProps {
  ramsId: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <FileImage className="h-5 w-5 text-blue-500" />;
  return <FileText className="h-5 w-5 text-muted-foreground" />;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AttachmentsTab({ ramsId }: AttachmentsTabProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAttachments = useCallback(async () => {
    try {
      const res = await fetch(`/api/rams/${ramsId}/attachments`);
      if (!res.ok) return;
      const data = await res.json() as Attachment[];
      setAttachments(data);
    } catch {
      // Non-fatal — list just stays empty
    } finally {
      setLoading(false);
    }
  }, [ramsId]);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadError(null);

    const body = new FormData();
    body.append('file', file);

    try {
      const res = await fetch(`/api/rams/${ramsId}/attachments`, {
        method: 'POST',
        body,
      });

      const data = await res.json() as { error?: string } & Partial<Attachment>;

      if (!res.ok) {
        setUploadError(data.error ?? 'Upload failed');
        return;
      }

      setAttachments((prev) => [data as Attachment, ...prev]);
    } catch {
      setUploadError('Network error — please try again');
    } finally {
      setUploading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    void uploadFile(files[0]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  async function handleDelete(attachment: Attachment) {
    if (!confirm(`Delete "${attachment.file_name}"?`)) return;
    setDeletingId(attachment.id);

    try {
      const res = await fetch(`/api/rams/${ramsId}/attachments/${attachment.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        alert(data.error ?? 'Delete failed');
        return;
      }

      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
    } catch {
      alert('Network error — please try again');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-5 w-5" />
          Attachments
        </CardTitle>
        <CardDescription>
          Supporting documents, evidence photos, and reference files for this RAMS submission.
          Max 25 MB per file.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload attachment — drag and drop or click to browse"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          className={[
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-sm transition-colors',
            dragOver
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-muted-foreground/25 text-muted-foreground hover:border-primary/50 hover:text-foreground',
            uploading && 'pointer-events-none opacity-60',
          ].join(' ')}
        >
          {uploading ? (
            <>
              <Upload className="h-8 w-8 animate-bounce" />
              <span>Uploading…</span>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8" />
              <span>
                <span className="font-medium">Drag &amp; drop</span> a file here, or{' '}
                <span className="font-medium underline">click to browse</span>
              </span>
              <span className="text-xs">
                PDF, Word, Excel, images, CSV, PPTX — up to 25 MB
              </span>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {/* Upload error */}
        {uploadError && (
          <div className="flex items-center justify-between rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{uploadError}</span>
            <button onClick={() => setUploadError(null)} aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* List */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading attachments…</p>
        ) : attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attachments yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <FileIcon mimeType={a.mime_type} />

                <div className="min-w-0 flex-1">
                  {a.url ? (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {a.file_name}
                    </a>
                  ) : (
                    <span className="truncate text-sm font-medium">{a.file_name}</span>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(a.file_size)} ·{' '}
                    {new Date(a.created_at).toLocaleDateString()}
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={deletingId === a.id}
                  onClick={() => handleDelete(a)}
                  aria-label={`Delete ${a.file_name}`}
                >
                  {deletingId === a.id ? (
                    <span className="text-xs">…</span>
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
