import { revalidateClinicalTrialsGovTrial } from "./adapters/clinicalTrialsGov.ts";
import { getTrialIndexStore } from "./index/store.ts";
import type { TrialIndexStore } from "./index/types.ts";
import type { NormalizedTrial } from "./types.ts";

export type RevalidationStatus = "verified_current" | "changed" | "limited" | "not_found";

export interface TrialRevalidationResult {
  canonicalId: string;
  status: RevalidationStatus;
  checkedAt: string;
  registry: string;
  registryId: string;
  sourceUrl: string;
  indexedLastUpdated?: string;
  liveLastUpdated?: string;
  changes: Array<{ field: "recruitment" | "locations" | "contacts" | "source_updated"; before: string; after: string }>;
  current?: Pick<NormalizedTrial, "recruitment" | "locations" | "contacts">;
  limitation: string;
}

function summarizeLocations(trial: NormalizedTrial) {
  return `${trial.locations.length} published site${trial.locations.length === 1 ? "" : "s"}`;
}

function summarizeContacts(trial: NormalizedTrial) {
  return `${trial.contacts.length} published contact${trial.contacts.length === 1 ? "" : "s"}`;
}

export async function revalidateIndexedTrial(canonicalId: string, fetcher: typeof fetch = fetch, signal?: AbortSignal, store: TrialIndexStore = getTrialIndexStore()): Promise<TrialRevalidationResult> {
  const checkedAt = new Date().toISOString();
  const indexed = await store.getByCanonicalId(canonicalId);
  const ctgovSource = indexed?.sources.find((source) => source.registry === "ClinicalTrials.gov");
  const nctId = ctgovSource?.registryId ?? (/^ctgov:(nct\d{8})$/i.exec(canonicalId)?.[1]);
  if (nctId) {
    const live = await revalidateClinicalTrialsGovTrial(nctId, fetcher, signal);
    if (!live) return {
      canonicalId, status: "not_found", checkedAt, registry: "ClinicalTrials.gov", registryId: nctId.toUpperCase(),
      sourceUrl: `https://clinicaltrials.gov/study/${nctId.toUpperCase()}`, changes: [],
      limitation: "The exact public record was not returned. Confirm the identifier directly with the registry or study team.",
    };
    const changes: TrialRevalidationResult["changes"] = [];
    if (indexed) {
      if (indexed.recruitment.raw !== live.recruitment.raw) changes.push({ field: "recruitment", before: indexed.recruitment.raw || "Not published", after: live.recruitment.raw || "Not published" });
      if (summarizeLocations(indexed) !== summarizeLocations(live)) changes.push({ field: "locations", before: summarizeLocations(indexed), after: summarizeLocations(live) });
      if (summarizeContacts(indexed) !== summarizeContacts(live)) changes.push({ field: "contacts", before: summarizeContacts(indexed), after: summarizeContacts(live) });
      const indexedUpdated = ctgovSource?.lastUpdated ?? "Not published";
      const liveUpdated = live.sources[0].lastUpdated ?? "Not published";
      if (indexedUpdated !== liveUpdated) changes.push({ field: "source_updated", before: indexedUpdated, after: liveUpdated });
    }
    return {
      canonicalId, status: changes.length ? "changed" : "verified_current", checkedAt,
      registry: "ClinicalTrials.gov", registryId: nctId.toUpperCase(), sourceUrl: live.sources[0].url,
      indexedLastUpdated: ctgovSource?.lastUpdated, liveLastUpdated: live.sources[0].lastUpdated,
      changes, current: { recruitment: live.recruitment, locations: live.locations, contacts: live.contacts },
      limitation: "This verifies the current public registry record only. A study team still determines site availability and final eligibility.",
    };
  }
  const tfdaSource = indexed?.sources.find((source) => source.registry === "TFDA");
  return {
    canonicalId, status: "limited", checkedAt, registry: "TFDA", registryId: tfdaSource?.registryId ?? canonicalId.replace(/^tfda:/i, ""),
    sourceUrl: tfdaSource?.url ?? "https://data.gov.tw/dataset/177198", indexedLastUpdated: tfdaSource?.lastUpdated,
    changes: [],
    limitation: "The TFDA open export does not provide a dependable single-record recruitment or study-site endpoint. Open the source and confirm status with the study team.",
  };
}
