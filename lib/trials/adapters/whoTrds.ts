import { z } from "zod";
import { normalizedTrialSchema } from "../schema.ts";
import { regionTierForCountries } from "../regions.ts";
import { cleanText, containsCjk, normalizeIdentifier, uniqueText } from "../text.ts";
import type { NormalizedTrial } from "../types.ts";

export const whoTrdsRecordSchema = z.object({
  registry: z.enum(["jRCT", "JPRN", "CRiS", "CTIS", "ANZCTR", "ChiCTR", "WHO ICTRP"]),
  trialId: z.string().min(1),
  publicUrl: z.string().url(),
  registrationDate: z.string().optional(),
  lastUpdated: z.string().optional(),
  publicTitle: z.string().min(1),
  scientificTitle: z.string().optional(),
  conditions: z.array(z.string()).default([]),
  interventions: z.array(z.string()).default([]),
  recruitmentStatus: z.string().optional(),
  countries: z.array(z.string()).default([]),
  inclusionCriteria: z.string().optional(),
  exclusionCriteria: z.string().optional(),
  minimumAge: z.string().optional(),
  maximumAge: z.string().optional(),
  sex: z.string().optional(),
  primarySponsor: z.string().optional(),
  secondaryIds: z.array(z.string()).default([]),
}).strict();

export type WhoTrdsRecord = z.infer<typeof whoTrdsRecordSchema>;

function category(status: string) {
  const normalized = status.toLocaleLowerCase("en");
  if (/recruiting|open|ongoing/.test(normalized) && !/not yet|not recruiting|closed|stopped/.test(normalized)) return "open" as const;
  if (/not yet/.test(normalized)) return "opening_soon" as const;
  if (/invite/.test(normalized)) return "invitation_only" as const;
  if (/not recruiting|complete|closed|terminate|withdraw|stopped/.test(normalized)) return "not_open" as const;
  return "unknown" as const;
}

export function normalizeWhoTrdsRecord(input: unknown, retrievedAt = new Date().toISOString()): NormalizedTrial {
  const record = whoTrdsRecordSchema.parse(input);
  const registryId = normalizeIdentifier(record.trialId);
  const recruitment = category(record.recruitmentStatus ?? "");
  const registryName = record.registry === "WHO ICTRP" ? "WHO ICTRP" : record.registry;
  return normalizedTrialSchema.parse({
    canonicalId: `${registryName.toLocaleLowerCase("en").replaceAll(/[^a-z0-9]+/g, "-")}:${registryId.toLocaleLowerCase("en")}`,
    identifiers: uniqueText([registryId, ...record.secondaryIds]).map(normalizeIdentifier),
    sources: [{ registry: registryName, registryId, url: record.publicUrl, retrievedAt, lastUpdated: cleanText(record.lastUpdated) }],
    title: cleanText(record.publicTitle), officialTitle: cleanText(record.scientificTitle),
    language: containsCjk(record.publicTitle) ? "mixed" : "en",
    conditions: uniqueText(record.conditions), phases: [], interventions: uniqueText(record.interventions),
    recruitment: { raw: cleanText(record.recruitmentStatus) ?? "Not published", category: recruitment, acceptingNewParticipants: recruitment === "open" },
    eligibility: { inclusion: cleanText(record.inclusionCriteria), exclusion: cleanText(record.exclusionCriteria), minimumAge: cleanText(record.minimumAge), maximumAge: cleanText(record.maximumAge), sex: cleanText(record.sex) },
    locations: uniqueText(record.countries).map((country) => ({ country })), contacts: [], regionTier: regionTierForCountries(record.countries),
  });
}
