"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FileText,
  X,
  Eye,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Camera,
} from "lucide-react";
import { getDocumentCategoryLabel, MAX_FILE_SIZE } from "@/lib/documents/file-validation";
import { useToast } from "@/components/ui/use-toast";

interface ComplianceDocument {
  id: string;
  file_name: string;
  file_type: string;
  document_category: string;
  extraction_status: "pending" | "processing" | "complete" | "failed";
  extraction_confidence: number | null;
  extracted_text: string | null;
  created_at: string;
}

export function ComplianceDocumentsTab({ projectId }: { projectId: string }) {
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState("health_and_safety");
  const [previewDocument, setPreviewDocument] = useState<ComplianceDocument | null>(null);
  const [extractingRequirements, setExtractingRequirements] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  /** Handle photos taken via the native camera input (capture="environment"). */
  const handleCameraCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Client-side size check — mirrors the dropzone maxSize constraint
      if (file.size > MAX_FILE_SIZE) {
        addToast({
          title: "File too large",
          description: `Photo is ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum size is 25MB.`,
          variant: "destructive",
        });
        if (cameraInputRef.current) cameraInputRef.current.value = "";
        return;
      }

      setUploading(true);
      setUploadProgress(0);

      try {
        // Rename with timestamp so photos are easy to identify in the list
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        const renamedFile = new File(
          [file],
          `document-photo-${timestamp}.jpg`,
          { type: file.type || "image/jpeg" }
        );

        const formData = new FormData();
        formData.append("file", renamedFile);
        formData.append("category", selectedCategory);

        const response = await fetch(
          `/api/projects/${projectId}/compliance-documents`,
          { method: "POST", body: formData }
        );

        if (response.ok) {
          const newDoc = await response.json();
          setDocuments((prev) => [newDoc, ...prev]);
          setUploadProgress(100);
          addToast({
            title: "Photo uploaded",
            description: "Document photo is being processed for text extraction.",
            variant: "success",
          });
        } else {
          const err = await response.json().catch(() => ({ error: "Upload failed" }));
          addToast({
            title: "Upload failed",
            description: err.error ?? "Could not upload the photo. Please try again.",
            variant: "destructive",
          });
        }
      } catch {
        addToast({
          title: "Upload failed",
          description: "Network error — check your connection and try again.",
          variant: "destructive",
        });
      } finally {
        setUploading(false);
        // Reset so the same file can be re-selected if needed
        if (cameraInputRef.current) cameraInputRef.current.value = "";
      }
    },
    [projectId, selectedCategory, addToast]
  );

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/compliance-documents`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error("Error loading documents:", error);
    }
  }, [projectId]);

  useEffect(() => {
    // Fetch-on-mount pattern: setState happens after async fetch, not
    // synchronously inside the effect body. Safe — no cascading renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDocuments();
  }, [loadDocuments]);

  // While any document is still being processed in the background, poll for
  // status updates until everything has settled (complete/failed).
  const hasInFlight = documents.some(
    (d) => d.extraction_status === "pending" || d.extraction_status === "processing"
  );

  useEffect(() => {
    if (!hasInFlight) return;
    const interval = setInterval(loadDocuments, 4000);
    return () => clearInterval(interval);
  }, [hasInFlight, loadDocuments]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      for (const file of acceptedFiles) {
        setUploading(true);
        setUploadProgress(0);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", selectedCategory);

        try {
          const response = await fetch(
            `/api/projects/${projectId}/compliance-documents`,
            { method: "POST", body: formData }
          );

          if (response.ok) {
            const newDoc = await response.json();
            setDocuments((prev) => [newDoc, ...prev]);
          }
        } catch (error) {
          console.error("Upload failed:", error);
        } finally {
          setUploading(false);
          setUploadProgress(100);
        }
      }
    },
    [projectId, selectedCategory]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
    },
    maxSize: 25 * 1024 * 1024,
  });

  const handleDelete = async (documentId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      const response = await fetch(`/api/compliance-documents/${documentId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== documentId));
      }
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handleReextract = async (documentId: string) => {
    try {
      const response = await fetch(
        `/api/compliance-documents/${documentId}/extract`,
        { method: "POST" }
      );

      if (response.ok) {
        const updatedDoc = await response.json();
        setDocuments((prev) =>
          prev.map((d) => (d.id === documentId ? updatedDoc : d))
        );
      }
    } catch (error) {
      console.error("Re-extraction failed:", error);
    }
  };

  const handleExtractRequirements = async () => {
    setExtractingRequirements(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/requirements/extract`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        addToast({
          title: "Requirements extracted",
          description: `Successfully extracted ${data.count} requirements.`,
          variant: "success",
        });
        loadDocuments();
      } else {
        const err = await response.json().catch(() => ({ error: "Extraction failed" }));
        addToast({
          title: "Extraction failed",
          description: err.error ?? "Could not extract requirements.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Failed to extract requirements:', error);
      addToast({
        title: "Extraction failed",
        description: "Network error — please try again.",
        variant: "destructive",
      });
    } finally {
      setExtractingRequirements(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "complete":
        return (
          <Badge variant="success">
            <CheckCircle className="mr-1 h-3 w-3" /> Extracted
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="warning">
            <RefreshCw className="mr-1 h-3 w-3 animate-spin" /> Processing
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <AlertTriangle className="mr-1 h-3 w-3" /> Failed
          </Badge>
        );
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Compliance Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Document Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="terms_and_conditions">Terms & Conditions</option>
                <option value="company_policy">Company Policy</option>
                <option value="project_policy">Project Policy</option>
                <option value="health_and_safety">Health & Safety</option>
                <option value="site_rules">Site Rules</option>
                <option value="client_requirements">Client Requirements</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div
              {...getRootProps()}
              className={[
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-gray-300 hover:border-primary",
              ].join(" ")}
            >
              <input {...getInputProps()} />
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              {isDragActive ? (
                <p className="text-lg">Drop the files here...</p>
              ) : (
                <>
                  <p className="text-lg font-medium">
                    Drag & drop files here, or click to select
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Supported: PDF, DOC, DOCX, XLS, XLSX, PPTX, CSV, TXT, JPG, PNG
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Maximum file size: 25MB
                  </p>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t" />
              <span className="text-sm text-muted-foreground">or</span>
              <div className="flex-1 border-t" />
            </div>

            {/*
              Native camera input — opens the device camera app directly.
              Works on mobile without needing getUserMedia browser permissions.
              On desktop it falls back to a file picker for image files.
              capture="environment" requests the rear (document-facing) camera.
            */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/jpeg,image/png"
              capture="environment"
              className="hidden"
              onChange={handleCameraCapture}
            />
            <Button
              variant="outline"
              className="w-full py-6"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
            >
              <Camera className="mr-2 h-5 w-5" />
              Take Photo of Document
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Opens your device camera. Photo will be processed with OCR to extract text.
            </p>

            {uploading && (
              <div className="space-y-2">
                <Progress value={uploadProgress} />
                <p className="text-sm text-muted-foreground">
                  Uploading and extracting text...
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Requirements Extraction</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Extract compliance requirements from uploaded documents to enable automatic RAMS review.
          </p>
          <Button
            onClick={handleExtractRequirements}
            disabled={extractingRequirements || documents.length === 0}
          >
            {extractingRequirements ? 'Extracting...' : 'Extract Requirements'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uploaded Documents ({documents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No compliance documents uploaded yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-center space-x-4 flex-1">
                    <FileText className="h-8 w-8 text-primary" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{doc.file_name}</h4>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-muted-foreground uppercase">
                          {doc.file_type}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-muted rounded">
                          {getDocumentCategoryLabel(doc.document_category)}
                        </span>
                        {getStatusBadge(doc.extraction_status)}
                        {doc.extraction_confidence !== null && (
                          <span className="text-xs text-muted-foreground">
                            Confidence:{" "}
                            {(doc.extraction_confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {doc.extracted_text && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewDocument(doc)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {doc.extraction_status === "failed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReextract(doc.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(doc.id)}
                    >
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {previewDocument && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto m-4">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-lg font-semibold">{previewDocument.file_name}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewDocument(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6">
              <div className="whitespace-pre-wrap text-sm">
                {previewDocument.extracted_text ?? "No text extracted"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
