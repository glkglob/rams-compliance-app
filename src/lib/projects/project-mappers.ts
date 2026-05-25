import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "@/lib/validations/project.schema";

export function toProjectInsert(input: CreateProjectInput, userId: string) {
  return {
    name: input.name,
    client_name: input.clientName,
    site_address: input.siteAddress,
    description: input.description,
    compliance_threshold: input.complianceThreshold ?? 80,
    created_by: userId,
  };
}

export function toProjectUpdate(input: UpdateProjectInput) {
  return Object.fromEntries(
    Object.entries({
      name: input.name,
      client_name: input.clientName,
      site_address: input.siteAddress,
      description: input.description,
      compliance_threshold: input.complianceThreshold,
    }).filter(([, value]) => value !== undefined)
  );
}
