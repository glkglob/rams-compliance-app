import { z } from "zod";

export const CDM_RISK_CATEGORIES = [
  "design",
  "construction",
  "temporary_works",
  "work_at_height",
  "excavation",
  "lifting",
  "plant_machinery",
  "electrical",
  "hazardous_substances",
  "fire",
  "public_interface",
  "environmental",
  "occupational_health",
  "other",
] as const;

export type CdmRiskCategory = (typeof CDM_RISK_CATEGORIES)[number];

const optionalText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
    z.string().max(maxLength).optional(),
  );

const optionalBoolean = z.preprocess((value) => {
  if (typeof value !== "string" || !value.trim()) return undefined;

  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  return value;
}, z.boolean().optional());

const optionalUuid = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.uuid().optional(),
);

const optionalRiskCategory = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.enum(CDM_RISK_CATEGORIES).optional(),
);

export const ramsCdmMetadataSchema = z.object({
  constructionPhasePlanSection: optionalText(255),
  primaryRiskCategory: optionalRiskCategory,
  linkedProjectRiskId: optionalUuid,
  contributesToHealthSafetyFile: optionalBoolean,
  healthSafetyFileSection: optionalText(255),
});

export const complianceDocumentCdmMetadataSchema = z.object({
  isPreConstructionInformation: optionalBoolean,
  preConstructionInformationSection: optionalText(255),
  contributesToHealthSafetyFile: optionalBoolean,
  healthSafetyFileSection: optionalText(255),
});

export function ramsCdmMetadataFromFormData(formData: FormData) {
  const parsed = ramsCdmMetadataSchema.parse({
    constructionPhasePlanSection: formData.get("constructionPhasePlanSection"),
    primaryRiskCategory: formData.get("primaryRiskCategory"),
    linkedProjectRiskId: formData.get("linkedProjectRiskId"),
    contributesToHealthSafetyFile: formData.get("contributesToHealthSafetyFile"),
    healthSafetyFileSection: formData.get("healthSafetyFileSection"),
  });

  return {
    construction_phase_plan_section: parsed.constructionPhasePlanSection ?? null,
    primary_risk_category: parsed.primaryRiskCategory ?? null,
    linked_project_risk_id: parsed.linkedProjectRiskId ?? null,
    contributes_to_health_safety_file: parsed.contributesToHealthSafetyFile ?? false,
    health_safety_file_section: parsed.healthSafetyFileSection ?? null,
  };
}

export function complianceDocumentCdmMetadataFromFormData(formData: FormData) {
  const parsed = complianceDocumentCdmMetadataSchema.parse({
    isPreConstructionInformation: formData.get("isPreConstructionInformation"),
    preConstructionInformationSection: formData.get("preConstructionInformationSection"),
    contributesToHealthSafetyFile: formData.get("contributesToHealthSafetyFile"),
    healthSafetyFileSection: formData.get("healthSafetyFileSection"),
  });

  return {
    is_pre_construction_information: parsed.isPreConstructionInformation ?? false,
    pre_construction_information_section: parsed.preConstructionInformationSection ?? null,
    contributes_to_health_safety_file: parsed.contributesToHealthSafetyFile ?? false,
    health_safety_file_section: parsed.healthSafetyFileSection ?? null,
  };
}
