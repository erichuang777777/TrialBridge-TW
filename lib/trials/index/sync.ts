import { loadClinicalTrialsGovCancerTrials, fetchClinicalTrialsGovVersion } from "../adapters/clinicalTrialsGov.ts";
import { loadOfficialTfdaRecords, normalizeTfdaRecord } from "../adapters/tfda.ts";
import type { RegistryName } from "../types.ts";
import { resolveTrialIndexProfile, trialMatchesIndexProfile, type TrialIndexProfile } from "./profile.ts";
import { publicFailureMessage, type IndexedRegistryName } from "./shared.ts";
import { getTrialIndexStore } from "./store.ts";
import type { TrialIndexSourceState, TrialIndexStore } from "./types.ts";

export interface TrialIndexSyncOptions {
  store?: TrialIndexStore;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  force?: boolean;
  clinicalTrialsMaxPages?: number;
  /** Which records to keep; defaults to TRIAL_INDEX_PROFILE (full). */
  profile?: TrialIndexProfile;
  onProgress?: (message: string) => void;
}

export interface TrialIndexSyncResult {
  registry: IndexedRegistryName;
  outcome: "synchronized" | "skipped";
  source: TrialIndexSourceState;
}

function latestTfdaVersion(records: ReturnType<typeof normalizeTfdaRecord>[]) {
  return records.map((trial) => trial.sources[0]?.lastUpdated).filter((value): value is string => Boolean(value)).sort().at(-1);
}

async function syncTfda(options: TrialIndexSyncOptions): Promise<TrialIndexSyncResult> {
  const store = options.store ?? getTrialIndexStore();
  const fetcher = options.fetcher ?? fetch;
  const startedAt = new Date().toISOString();
  const runId = await store.markSyncing("TFDA", startedAt);
  const startedMs = performance.now();
  try {
    options.onProgress?.("TFDA · downloading and validating the official full export");
    const raw = await loadOfficialTfdaRecords(fetcher);
    options.signal?.throwIfAborted();
    const retrievedAt = new Date().toISOString();
    const profile = options.profile ?? resolveTrialIndexProfile();
    const trials = raw.map((record) => normalizeTfdaRecord(record, retrievedAt)).filter((trial) => trialMatchesIndexProfile(trial, profile));
    const sourceVersion = latestTfdaVersion(trials);
    const finishedAt = new Date().toISOString();
    const source = await store.replaceSource({ registry: "TFDA", trials, sourceVersion, startedAt, finishedAt, durationMs: Math.round(performance.now() - startedMs) });
    options.onProgress?.(`TFDA · indexed ${trials.length.toLocaleString("en")} public records`);
    return { registry: "TFDA", outcome: "synchronized", source };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    await store.markFailure("TFDA", runId, startedAt, finishedAt, Math.round(performance.now() - startedMs), publicFailureMessage(error));
    throw error;
  }
}

async function syncClinicalTrialsGov(options: TrialIndexSyncOptions): Promise<TrialIndexSyncResult> {
  const store = options.store ?? getTrialIndexStore();
  const fetcher = options.fetcher ?? fetch;
  const startedAt = new Date().toISOString();
  const current = await store.sourceState("ClinicalTrials.gov");
  const incremental = !options.force && Boolean(current?.recordCount && current.lastSuccessAt);
  if (!options.force) {
    const upstreamVersion = await fetchClinicalTrialsGovVersion(fetcher, options.signal);
    if (upstreamVersion && current?.recordCount && current.sourceVersion === upstreamVersion) {
      const message = "Upstream dataTimestamp is unchanged; existing indexed records were retained.";
      await store.markSkipped("ClinicalTrials.gov", startedAt, upstreamVersion, message);
      return { registry: "ClinicalTrials.gov", outcome: "skipped", source: (await store.sourceState("ClinicalTrials.gov"))! };
    }
  }
  const runId = await store.markSyncing("ClinicalTrials.gov", startedAt);
  const startedMs = performance.now();
  const profile = options.profile ?? resolveTrialIndexProfile();
  try {
    const lowerBound = incremental
      ? new Date(Date.parse(current!.lastSuccessAt!) - 2 * 24 * 60 * 60_000).toISOString().slice(0, 10)
      : undefined;
    options.onProgress?.(incremental
      ? `ClinicalTrials.gov · collecting cancer records updated since ${lowerBound} (overlap included)`
      : "ClinicalTrials.gov · collecting the complete public cancer corpus");
    const loaded = await loadClinicalTrialsGovCancerTrials({
      fetcher, signal: options.signal, maxPages: options.clinicalTrialsMaxPages, collectTrials: false,
      queryTerm: lowerBound ? `AREA[LastUpdatePostDate]RANGE[${lowerBound}, MAX]` : undefined,
      onTrialsPage: (trials) => store.stageSourceBatch("ClinicalTrials.gov", runId, trials.filter((trial) => trialMatchesIndexProfile(trial, profile)), new Date().toISOString()),
      onPage: ({ page, received, totalCount }) => options.onProgress?.(`ClinicalTrials.gov · page ${page} · ${received.toLocaleString("en")}${totalCount ? `/${totalCount.toLocaleString("en")}` : ""}`),
    });
    if (!loaded.complete) throw new Error("ClinicalTrials.gov bulk load stopped before the final page; the existing complete index was retained");
    options.onProgress?.(`ClinicalTrials.gov · download complete (${loaded.receivedCount.toLocaleString("en")}); publishing the staged index atomically`);
    const commit = incremental ? store.commitStagedIncrementalSource.bind(store) : store.commitStagedSource.bind(store);
    const source = await commit({ registry: "ClinicalTrials.gov", runId, receivedCount: loaded.receivedCount, sourceVersion: loaded.sourceVersion, startedAt });
    options.onProgress?.(`ClinicalTrials.gov · ${incremental ? "merged" : "indexed"} ${source.recordCount.toLocaleString("en")} public records`);
    return { registry: "ClinicalTrials.gov", outcome: "synchronized", source };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    await store.markFailure("ClinicalTrials.gov", runId, startedAt, finishedAt, Math.round(performance.now() - startedMs), publicFailureMessage(error));
    throw error;
  }
}

export async function syncTrialIndexSource(registry: IndexedRegistryName, options: TrialIndexSyncOptions = {}) {
  return registry === "TFDA" ? syncTfda(options) : syncClinicalTrialsGov(options);
}

export async function syncTrialIndex(options: TrialIndexSyncOptions = {}) {
  const store = options.store ?? getTrialIndexStore();
  const results: TrialIndexSyncResult[] = [];
  const failures: Array<{ registry: IndexedRegistryName; message: string }> = [];
  for (const registry of ["TFDA", "ClinicalTrials.gov"] as const) {
    try { results.push(await syncTrialIndexSource(registry, { ...options, store })); }
    catch (error) { failures.push({ registry, message: publicFailureMessage(error) }); }
  }
  return { results, failures, health: await store.health() };
}
