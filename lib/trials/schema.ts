import { z } from "zod";

export const trialSourceSchema = z.object({
  registry: z.enum(["TFDA", "ClinicalTrials.gov"]),
  registryId: z.string().min(1),
  url: z.string().url(),
  retrievedAt: z.string().datetime(),
  lastUpdated: z.string().optional(),
  license: z.string().optional(),
});

export const normalizedTrialSchema = z.object({
  canonicalId: z.string().min(1),
  identifiers: z.array(z.string().min(1)).min(1),
  sources: z.array(trialSourceSchema).min(1),
  title: z.string().min(1),
  officialTitle: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  language: z.enum(["zh-Hant", "en", "mixed", "unknown"]),
  conditions: z.array(z.string().min(1)),
  phases: z.array(z.string().min(1)),
  studyType: z.string().min(1).optional(),
  interventions: z.array(z.string().min(1)),
  recruitment: z.object({
    raw: z.string(),
    category: z.enum(["open", "opening_soon", "invitation_only", "not_open", "unknown"]),
    acceptingNewParticipants: z.boolean(),
  }),
  eligibility: z.object({
    combined: z.string().min(1).optional(),
    inclusion: z.string().min(1).optional(),
    exclusion: z.string().min(1).optional(),
    minimumAge: z.string().min(1).optional(),
    maximumAge: z.string().min(1).optional(),
    sex: z.string().min(1).optional(),
  }),
  locations: z.array(z.object({
    country: z.string().min(1),
    city: z.string().min(1).optional(),
    facility: z.string().min(1).optional(),
    recruitmentStatus: z.string().min(1).optional(),
  })),
  contacts: z.array(z.object({
    role: z.enum(["central", "site"]),
    name: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    facility: z.string().min(1).optional(),
  })),
  regionTier: z.enum(["taiwan", "asia", "world", "unknown"]),
});

export const trialSearchRequestSchema = z.object({
  condition: z.string().trim().min(2).max(120),
  pageSize: z.number().int().min(1).max(100).default(30),
  includeNotOpen: z.boolean().default(false),
}).strict();
