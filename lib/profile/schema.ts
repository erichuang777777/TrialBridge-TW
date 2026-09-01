import { z } from "zod";

export const factDomainSchema = z.enum([
  "cancer_type", "primary_site", "histology", "stage", "disease_extent", "biomarker",
  "prior_therapy", "current_therapy", "treatment_date", "performance_status", "organ_function",
  "age_band", "sex_eligibility", "travel_preference", "other_medical_fact",
]);

export const draftFactSchema = z.object({
  id: z.string().regex(/^fact_[a-z0-9_]{1,40}$/),
  domain: factDomainSchema,
  value: z.string().trim().min(1).max(500),
  displayZhHant: z.string().trim().min(1).max(500),
  displayEn: z.string().trim().min(1).max(500),
  source: z.enum(["masked_note", "user_statement", "caregiver_statement"]),
  confidence: z.number().min(0).max(1),
  evidenceExcerpt: z.string().trim().max(240).optional(),
  confirmed: z.literal(false),
}).strict();

export const profileDraftSchema = z.object({
  schemaVersion: z.literal("1.0"),
  language: z.enum(["zh-Hant", "en", "mixed"]),
  subjectRole: z.enum(["patient", "caregiver"]),
  facts: z.array(draftFactSchema).max(80),
  missingQuestions: z.array(z.object({
    id: z.string().regex(/^question_[a-z0-9_]{1,40}$/),
    domain: factDomainSchema,
    questionZhHant: z.string().trim().min(1).max(300),
    questionEn: z.string().trim().min(1).max(300),
    reason: z.string().trim().min(1).max(300),
  }).strict()).max(20),
  safetyNote: z.string().trim().min(1).max(500),
}).strict();

export type ProfileDraft = z.infer<typeof profileDraftSchema>;

export const confirmedFactSchema = draftFactSchema.omit({ confirmed: true }).extend({
  confirmed: z.literal(true),
  confirmedAt: z.string().datetime(),
  confirmationSource: z.enum(["patient", "caregiver"]),
});

export const confirmedProfileSchema = z.object({
  schemaVersion: z.literal("1.0"),
  language: z.enum(["zh-Hant", "en", "mixed"]),
  subjectRole: z.enum(["patient", "caregiver"]),
  facts: z.array(confirmedFactSchema).min(1).max(80),
  confirmedAt: z.string().datetime(),
  cloudUseApproved: z.boolean().default(false),
}).strict();

export type ConfirmedProfile = z.infer<typeof confirmedProfileSchema>;

const forbiddenDomains = [
  "name", "email", "phone", "address", "birth_date", "national_id", "medical_record_number",
];

export function confirmProfile(
  draft: ProfileDraft,
  edits: Record<string, { value: string; displayZhHant: string; displayEn: string }>,
  confirmationSource: "patient" | "caregiver",
  confirmedAt = new Date().toISOString(),
): ConfirmedProfile {
  const facts = draft.facts.map((fact) => {
    const edit = edits[fact.id];
    const value = edit?.value ?? fact.value;
    if (forbiddenDomains.includes(fact.domain) || forbiddenDomains.some((term) => value.toLocaleLowerCase("en").includes(`${term}:`))) {
      throw new Error(`Fact ${fact.id} contains a forbidden identifier domain`);
    }
    return {
      ...fact,
      value,
      displayZhHant: edit?.displayZhHant ?? fact.displayZhHant,
      displayEn: edit?.displayEn ?? fact.displayEn,
      confirmed: true as const,
      confirmedAt,
      confirmationSource,
    };
  });
  return confirmedProfileSchema.parse({
    schemaVersion: draft.schemaVersion,
    language: draft.language,
    subjectRole: draft.subjectRole,
    facts,
    confirmedAt,
    cloudUseApproved: false,
  });
}
