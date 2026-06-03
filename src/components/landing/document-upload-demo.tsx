'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Loader2, AlertCircle, CheckCircle, Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';

interface UploadResult {
  filename: string;
  size: number;
  mimetype: string;
  extractedText: string;
  status: string;
}

const ALLOWED_TYPES = ['.pdf', '.docx', '.doc', '.txt'];

export function DocumentUploadDemo() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      // Client-side quick validation
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ALLOWED_TYPES.includes(ext)) {
        setError(`Unsupported file type: ${ext}. Please use PDF, DOCX, DOC, or TXT.`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('File is too large. Maximum size for demo is 10MB.');
        return;
      }
      setSelectedFile(file);
      setError(null);
      setResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'text/plain': ['.txt'],
    },
    maxSize: 10 * 1024 * 1024,
  });

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setError(null);
    setResult(null);
  };

  const handleCopyText = async () => {
    if (!result?.extractedText) return;
    try {
      await navigator.clipboard.writeText(result.extractedText);
      alert('Extracted text copied to clipboard!');
    } catch {
      // Fallback
      console.warn('Clipboard API not available');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-5 w-5 text-primary" />
          Document Upload &amp; Extraction
          <StatusBadge status="live" className="ml-auto" />
        </CardTitle>
        <CardDescription>
          Upload a PDF, Word (.doc/.docx), or TXT file. Text will be extracted securely on the server and returned for review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dropzone */}
        {!result && (
          <div
            {...getRootProps()}
            className={[
              'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all',
              isDragActive
                ? 'border-primary bg-primary/5 scale-[1.01]'
                : 'border-muted-foreground/30 hover:border-primary/60 hover:bg-accent/30',
            ].join(' ')}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
            {isDragActive ? (
              <p className="font-medium">Drop the document here...</p>
            ) : (
              <>
                <p className="font-medium">Drag &amp; drop a document, or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supported: PDF, DOCX, DOC, TXT • Max 10MB
                </p>
              </>
            )}
          </div>
        )}

        {/* Selected file info */}
        {selectedFile && !result && (
          <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate font-medium">{selectedFile.name}</span>
              <span className="text-muted-foreground">({formatFileSize(selectedFile.size)})</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClear} disabled={uploading}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Action button */}
        {selectedFile && !result && (
          <Button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full"
            size="lg"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Extracting text...
              </>
            ) : (
              'Extract Text from Document'
            )}
          </Button>
        )}

        {/* Loading state (when no selected file but uploading - edge case) */}
        {uploading && !selectedFile && (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing upload...
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Upload failed</p>
                <p className="text-destructive/90 mt-0.5">{error}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={handleClear}>
              Try another file
            </Button>
          </div>
        )}

        {/* Success state with extracted text */}
        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Extraction complete • Status: {result.status}</span>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-2 text-xs rounded border bg-muted/30 p-3">
              <div>
                <span className="text-muted-foreground">Filename</span>
                <div className="font-mono truncate">{result.filename}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Size</span>
                <div>{formatFileSize(result.size)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">MIME Type</span>
                <div className="font-mono text-[10px]">{result.mimetype}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Status</span>
                <div>
                  <Badge variant="outline" className="text-green-600 border-green-600/30">
                    {result.status}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Extracted Text */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">Extracted Text (review below)</span>
                <Button variant="outline" size="sm" onClick={handleCopyText}>
                  <Copy className="mr-1.5 h-3 w-3" />
                  Copy
                </Button>
              </div>
              <div className="relative">
                <pre className="max-h-80 overflow-auto rounded-md border bg-background p-4 text-xs leading-relaxed font-mono whitespace-pre-wrap">
                  {result.extractedText || <span className="text-muted-foreground italic">No text extracted.</span>}
                </pre>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClear} className="flex-1">
                Upload another document
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  // In a real app this would navigate to /projects or open RAMS creator
                  alert('In the full application this would let you attach the extracted content to a project or new RAMS document.');
                }}
              >
                Use in RAMS (demo)
              </Button>
            </div>

            <p className="text-[10px] text-center text-muted-foreground">
              Live extraction demo (processed server-side, not stored). For full AI gap analysis and human decision recording, use inside a Project.
            </p>
          </div>
        )}

        <p className="text-[10px] text-center text-muted-foreground pt-1">
          Files are processed securely on the server using pdf-parse (PDF) and mammoth (Word).
        </p>
      </CardContent>
    </Card>
  );
}
