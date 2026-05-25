import { z } from "zod";

export const ALLOWED_MIME_TYPES = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;

export const ALLOWED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "txt",
  "csv",
  "xls",
  "xlsx",
  "pptx",
  "jpg",
  "jpeg",
  "png",
] as const;

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export const fileValidationSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string(),
  fileSizeBytes: z.number().max(MAX_FILE_SIZE, "File size must be less than 25MB"),
});

export interface FileValidationResult {
  isSupported: boolean;
  normalisedFileType: string | null;
  requiresOcr: boolean;
  issues: string[];
}

export function validateFile(
  fileName: string,
  mimeType: string,
  fileSizeBytes: number
): FileValidationResult {
  const issues: string[] = [];
  let isSupported = true;
  let normalisedFileType: string | null = null;
  let requiresOcr = false;

  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension || !ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
    issues.push(`File extension .${extension} is not supported`);
    isSupported = false;
  }

  const normalizedMimeType = ALLOWED_MIME_TYPES[mimeType as keyof typeof ALLOWED_MIME_TYPES];
  if (!normalizedMimeType) {
    issues.push(`MIME type ${mimeType} is not supported`);
    isSupported = false;
  } else {
    normalisedFileType = normalizedMimeType;
  }

  if (fileSizeBytes > MAX_FILE_SIZE) {
    issues.push(
      `File size (${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of 25MB`
    );
    isSupported = false;
  }

  if (mimeType.startsWith("image/")) {
    requiresOcr = true;
  }

  return { isSupported, normalisedFileType, requiresOcr, issues };
}

export const FILE_TYPE_TO_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_MIME_TYPES).map(([mime, ext]) => [ext, mime])
) as Record<string, string>;

FILE_TYPE_TO_MIME["jpeg"] = "image/jpeg";
FILE_TYPE_TO_MIME["txt"] = "text/plain";
FILE_TYPE_TO_MIME["csv"] = "text/csv";

export function getMimeTypeForFileType(fileType: string): string {
  return FILE_TYPE_TO_MIME[fileType] ?? `application/${fileType}`;
}

export function getDocumentCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    terms_and_conditions: "Terms & Conditions",
    company_policy: "Company Policy",
    project_policy: "Project Policy",
    health_and_safety: "Health & Safety",
    site_rules: "Site Rules",
    client_requirements: "Client Requirements",
    other: "Other",
  };
  return labels[category] ?? category;
}
