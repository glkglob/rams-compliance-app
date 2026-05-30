"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const schema = z.object({
  subcontractorName: z.string().min(1, "Subcontractor name is required"),
  subcontractorEmail: z
    .string()
    .email("Invalid email address")
    .optional()
    .or(z.literal("")),
  tradePackage: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewRAMSPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    if (!file) {
      setError("Please select a file");
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("subcontractorName", data.subcontractorName);
    if (data.subcontractorEmail) {
      formData.append("subcontractorEmail", data.subcontractorEmail);
    }
    if (data.tradePackage) {
      formData.append("tradePackage", data.tradePackage);
    }

    try {
      const response = await fetch(`/api/projects/${params.projectId}/rams`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const rams = (await response.json()) as { id: string };
        // Pass a hint so the detail page can show prominent "Run AI Analysis" guidance
        router.push(`/rams/${rams.id}?justUploaded=true`);
      } else {
        const errorData = (await response.json()) as { error?: string };
        setError(errorData.error ?? "Failed to upload RAMS");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setError("An unexpected error occurred");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl p-6">
      <Button
        variant="ghost"
        onClick={() => router.back()}
        className="mb-6"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Submit RAMS Document</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Subcontractor Name *
              </label>
              <Input
                {...register("subcontractorName")}
                placeholder="Enter subcontractor company name"
                className={errors.subcontractorName ? "border-destructive" : ""}
              />
              {errors.subcontractorName && (
                <p className="mt-1 text-sm text-destructive">
                  {errors.subcontractorName.message}
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Subcontractor Email
              </label>
              <Input
                {...register("subcontractorEmail")}
                type="email"
                placeholder="subcontractor@example.com"
                className={errors.subcontractorEmail ? "border-destructive" : ""}
              />
              {errors.subcontractorEmail && (
                <p className="mt-1 text-sm text-destructive">
                  {errors.subcontractorEmail.message}
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Trade Package
              </label>
              <Input
                {...register("tradePackage")}
                placeholder="e.g. Electrical, Plumbing, HVAC"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                RAMS Document *
              </label>
              <div className="rounded-lg border-2 border-dashed p-8 text-center">
                {file ? (
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFile(null)}
                      className="mt-2"
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                    <label className="cursor-pointer">
                      <span className="font-medium text-primary">Click to upload</span>
                      <span className="text-muted-foreground"> or drag and drop</span>
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.pptx,.jpg,.jpeg,.png"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    <p className="mt-2 text-sm text-muted-foreground">
                      PDF, DOC, DOCX, XLS, XLSX, PPTX, CSV, TXT, JPG, PNG up to 25 MB
                    </p>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="rounded border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={uploading || !file}>
                {uploading ? "Uploading…" : "Submit for Review"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
