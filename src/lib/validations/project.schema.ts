import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(255),
  clientName: optionalText(255),
  siteAddress: optionalText(500),
  description: optionalText(2000),
  complianceThreshold: z
    .number()
    .int()
    .min(0, "Threshold must be at least 0")
    .max(100, "Threshold cannot exceed 100"),
});

export const updateProjectSchema = createProjectSchema.partial();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
