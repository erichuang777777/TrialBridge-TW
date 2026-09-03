export type RegistryName = "TFDA" | "ClinicalTrials.gov" | "NCI CTS" | "WHO ICTRP" | "jRCT" | "JPRN" | "CRiS" | "CTIS" | "ANZCTR" | "ChiCTR";
export type RegionTier = "taiwan" | "asia" | "world" | "unknown";
export type RecruitmentCategory =
  | "open"
  | "opening_soon"
  | "invitation_only"
  | "not_open"
  | "unknown";

export interface TrialSource {
  registry: RegistryName;
  registryId: string;
  url: string;
  retrievedAt: string;
  lastUpdated?: string;
  license?: string;
}

export interface TrialLocation {
  country: string;
  city?: string;
  facility?: string;
  recruitmentStatus?: string;
}

export interface TrialContact {
  role: "central" | "site" | "investigator";
  name?: string;
  email?: string;
  phone?: string;
  facility?: string;
  affiliation?: string;
  investigatorRole?: string;
}

export interface NormalizedTrial {
  canonicalId: string;
  identifiers: string[];
  sources: TrialSource[];
  title: string;
  officialTitle?: string;
  summary?: string;
  language: "zh-Hant" | "en" | "mixed" | "unknown";
  conditions: string[];
  phases: string[];
  studyType?: string;
  interventions: string[];
  recruitment: {
    raw: string;
    category: RecruitmentCategory;
    acceptingNewParticipants: boolean;
  };
  eligibility: {
    combined?: string;
    inclusion?: string;
    exclusion?: string;
    minimumAge?: string;
    maximumAge?: string;
    sex?: string;
  };
  locations: TrialLocation[];
  contacts: TrialContact[];
  regionTier: RegionTier;
}

export interface TrialSearchInput {
  condition: string;
  pageSize: number;
  includeNotOpen: boolean;
}

export interface TrialDataState {
  mode: "live" | "fresh_cache" | "stale_cache" | "indexed";
  loadedAt: string;
  storage?: "process_memory" | "scheduled_file" | "sqlite" | "postgres";
}

export interface TrialAdapterResult {
  registry: RegistryName;
  trials: NormalizedTrial[];
  retrievedAt: string;
  sourceVersion?: string;
  warning?: string;
  dataState: TrialDataState;
}

export interface TrialAdapterSearchOptions {
  signal?: AbortSignal;
}

export interface TrialRegistryAdapter {
  readonly registry: RegistryName;
  search(input: TrialSearchInput, options?: TrialAdapterSearchOptions): Promise<TrialAdapterResult>;
}
