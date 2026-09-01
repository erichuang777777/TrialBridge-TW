import { z } from "zod";
import { normalizedTrialSchema } from "../schema.ts";
import { regionTierForCountries } from "../regions.ts";
import { cleanText, normalizeIdentifier, uniqueText } from "../text.ts";
import { splitEligibilityCriteria } from "../eligibility.ts";
import type {
  NormalizedTrial,
  RecruitmentCategory,
  TrialAdapterResult,
  TrialRegistryAdapter,
  TrialSearchInput,
} from "../types.ts";

const API_BASE = "https://clinicaltrials.gov/api/v2";
const OPEN_STATUSES = ["RECRUITING", "NOT_YET_RECRUITING", "ENROLLING_BY_INVITATION"];
const RESPONSE_FIELDS = [
  "NCTId", "BriefTitle", "OfficialTitle", "OrgStudyIdInfo", "SecondaryIdInfo",
  "OverallStatus", "LastUpdatePostDate", "BriefSummary", "Condition", "StudyType", "Phase",
  "InterventionName", "InterventionType", "EligibilityCriteria", "MinimumAge", "MaximumAge", "Sex",
  "CentralContactName", "CentralContactEMail", "CentralContactPhone",
  "LocationFacility", "LocationCity", "LocationCountry", "LocationStatus",
  "LocationContactName", "LocationContactEMail", "LocationContactPhone",
];

const rawStudySchema = z.object({
  protocolSection: z.object({
    identificationModule: z.object({
      nctId: z.string(),
      briefTitle: z.string(),
      officialTitle: z.string().optional(),
      orgStudyIdInfo: z.object({ id: z.string().optional() }).optional(),
      secondaryIdInfos: z.array(z.object({ id: z.string().optional() })).optional(),
    }),
    statusModule: z.object({
      overallStatus: z.string(),
      lastUpdatePostDateStruct: z.object({ date: z.string().optional() }).optional(),
    }),
    descriptionModule: z.object({ briefSummary: z.string().optional() }).optional(),
    conditionsModule: z.object({ conditions: z.array(z.string()).optional() }).optional(),
    designModule: z.object({ studyType: z.string().optional(), phases: z.array(z.string()).optional() }).optional(),
    armsInterventionsModule: z.object({
      interventions: z.array(z.object({ name: z.string().optional(), type: z.string().optional() })).optional(),
    }).optional(),
    eligibilityModule: z.object({
      eligibilityCriteria: z.string().optional(),
      minimumAge: z.string().optional(),
      maximumAge: z.string().optional(),
      sex: z.string().optional(),
    }).optional(),
    contactsLocationsModule: z.object({
      centralContacts: z.array(z.object({
        name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(),
      })).optional(),
      locations: z.array(z.object({
        facility: z.string().optional(), city: z.string().optional(), country: z.string().optional(),
        status: z.string().optional(),
        contacts: z.array(z.object({
          name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(),
        })).optional(),
      })).optional(),
    }).optional(),
  }),
});

const searchResponseSchema = z.object({
  studies: z.array(rawStudySchema),
  totalCount: z.number().optional(),
});

const versionSchema = z.object({ dataTimestamp: z.string().optional() });
type RawStudy = z.infer<typeof rawStudySchema>;

function recruitmentCategory(status: string): RecruitmentCategory {
  if (status === "RECRUITING") return "open";
  if (status === "NOT_YET_RECRUITING") return "opening_soon";
  if (status === "ENROLLING_BY_INVITATION") return "invitation_only";
  return status ? "not_open" : "unknown";
}

export function normalizeClinicalTrialsGovStudy(raw: RawStudy, retrievedAt: string): NormalizedTrial {
  const section = raw.protocolSection;
  const identification = section.identificationModule;
  const nctId = normalizeIdentifier(identification.nctId);
  const locations = (section.contactsLocationsModule?.locations ?? []).flatMap((location) => {
    const country = cleanText(location.country);
    return country ? [{
      country,
      city: cleanText(location.city),
      facility: cleanText(location.facility),
      recruitmentStatus: cleanText(location.status),
    }] : [];
  });
  const contacts = [
    ...(section.contactsLocationsModule?.centralContacts ?? []).map((contact) => ({
      role: "central" as const,
      name: cleanText(contact.name), email: cleanText(contact.email), phone: cleanText(contact.phone),
    })),
    ...(section.contactsLocationsModule?.locations ?? []).flatMap((location) =>
      (location.contacts ?? []).map((contact) => ({
        role: "site" as const,
        facility: cleanText(location.facility),
        name: cleanText(contact.name), email: cleanText(contact.email), phone: cleanText(contact.phone),
      })),
    ),
  ];
  const status = section.statusModule.overallStatus;
  const identifiers = uniqueText([
    nctId,
    identification.orgStudyIdInfo?.id,
    ...(identification.secondaryIdInfos ?? []).map((identifier) => identifier.id),
  ]).map(normalizeIdentifier);
  const eligibility = splitEligibilityCriteria(section.eligibilityModule?.eligibilityCriteria);

  return normalizedTrialSchema.parse({
    canonicalId: `ctgov:${nctId.toLocaleLowerCase("en")}`,
    identifiers,
    sources: [{
      registry: "ClinicalTrials.gov",
      registryId: nctId,
      url: `https://clinicaltrials.gov/study/${nctId}`,
      retrievedAt,
      lastUpdated: section.statusModule.lastUpdatePostDateStruct?.date,
    }],
    title: cleanText(identification.briefTitle),
    officialTitle: cleanText(identification.officialTitle),
    summary: cleanText(section.descriptionModule?.briefSummary),
    language: "en",
    conditions: uniqueText(section.conditionsModule?.conditions ?? []),
    phases: uniqueText(section.designModule?.phases ?? []),
    studyType: cleanText(section.designModule?.studyType),
    interventions: uniqueText((section.armsInterventionsModule?.interventions ?? []).map((item) =>
      item.name && item.type ? `${item.type}: ${item.name}` : item.name,
    )),
    recruitment: {
      raw: status,
      category: recruitmentCategory(status),
      acceptingNewParticipants: OPEN_STATUSES.includes(status),
    },
    eligibility: {
      ...eligibility,
      minimumAge: cleanText(section.eligibilityModule?.minimumAge),
      maximumAge: cleanText(section.eligibilityModule?.maximumAge),
      sex: cleanText(section.eligibilityModule?.sex),
    },
    locations,
    contacts,
    regionTier: regionTierForCountries(locations.map((location) => location.country)),
  });
}

export class ClinicalTrialsGovAdapter implements TrialRegistryAdapter {
  readonly registry = "ClinicalTrials.gov" as const;
  private readonly fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher;
  }

  async search(input: TrialSearchInput): Promise<TrialAdapterResult> {
    const retrievedAt = new Date().toISOString();
    const searchUrl = new URL(`${API_BASE}/studies`);
    searchUrl.searchParams.set("query.cond", input.condition);
    searchUrl.searchParams.set("pageSize", String(input.pageSize));
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("countTotal", "true");
    searchUrl.searchParams.set("fields", RESPONSE_FIELDS.join(","));
    if (!input.includeNotOpen) searchUrl.searchParams.set("filter.overallStatus", OPEN_STATUSES.join("|"));

    const [studiesResponse, versionResponse] = await Promise.all([
      this.fetcher(searchUrl, { headers: { Accept: "application/json" }, cache: "no-store" }),
      this.fetcher(`${API_BASE}/version`, { headers: { Accept: "application/json" }, cache: "no-store" }),
    ]);
    if (!studiesResponse.ok) throw new Error(`ClinicalTrials.gov returned HTTP ${studiesResponse.status}`);
    const payload = searchResponseSchema.parse(await studiesResponse.json());
    let sourceVersion: string | undefined;
    if (versionResponse.ok) sourceVersion = versionSchema.parse(await versionResponse.json()).dataTimestamp;

    return {
      registry: this.registry,
      retrievedAt,
      sourceVersion,
      trials: payload.studies.map((study) => normalizeClinicalTrialsGovStudy(study, retrievedAt)),
    };
  }
}
