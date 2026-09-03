import { ClinicalTrialsGovAdapter } from "../adapters/clinicalTrialsGov.ts";
import { TfdaAdapter } from "../adapters/tfda.ts";
import { deduplicateTrials } from "../dedupe.ts";
import { rankTrials } from "../regions.ts";
import { searchTrialRegistries, type FederatedTrialSearchResult } from "../search.ts";
import type { RegistryName, TrialRegistryAdapter, TrialSearchInput } from "../types.ts";
import { expandWithNciTerminology } from "../terminology/nci.ts";
import { trackedRegistries, type IndexedRegistryName } from "./shared.ts";
import { getTrialIndexStore } from "./store.ts";
import type { TrialIndexHealth, TrialIndexSearchResult, TrialIndexStore } from "./types.ts";

interface CatalogRuntime {
  signal?: AbortSignal;
  timeoutMs?: number;
  now?: () => number;
  /** Test seam: a store other than the process-wide one. */
  store?: TrialIndexStore;
  /** Test seam: build the live adapter for a registry the index cannot serve. */
  liveAdapterFactory?: (registry: IndexedRegistryName) => TrialRegistryAdapter;
  /** Overrides TFDA_LIVE_FALLBACK. */
  tfdaLiveFallback?: boolean;
}

export interface TrialIndexAccessState {
  status: "ok" | "unavailable";
  lastFailureAt?: string;
  /** Bounded, metadata-only classification; never a path, URL, or record. */
  message?: string;
}

let indexAccessState: TrialIndexAccessState = { status: "ok" };
let warnedAboutIndexAccess = false;

/** Exposed by data-health so a silent live-only fallback is visible to operators. */
export function getTrialIndexAccessState(): TrialIndexAccessState {
  return indexAccessState;
}

function classifyIndexFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/read-only|readonly/iu.test(message)) return "index_read_only_write_attempted";
  if (/schema|migrat/iu.test(message)) return "index_schema_mismatch";
  if (/auth|token|401|403/iu.test(message)) return "index_authentication_failed";
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|network|timeout|ETIMEDOUT/iu.test(message)) return "index_unreachable";
  if (/node:sqlite|EROFS|ENOENT|SQLITE_CANTOPEN/iu.test(message)) return "index_storage_unavailable";
  return "index_error";
}

function recordIndexProblem(error: unknown) {
  const message = classifyIndexFailure(error);
  indexAccessState = { status: "unavailable", lastFailureAt: new Date().toISOString(), message };
  if (!warnedAboutIndexAccess) {
    warnedAboutIndexAccess = true;
    console.warn(`[trial-index] public index unavailable (${message}); falling back to live registries for this process`);
  }
}

/** TFDA's live path downloads a 175 MB export; hosted functions must opt out. */
export function tfdaLiveFallbackEnabled(value = process.env.TFDA_LIVE_FALLBACK): boolean {
  const normalized = value?.trim().toLocaleLowerCase("en");
  return !(normalized === "false" || normalized === "0" || normalized === "off");
}

function defaultLiveAdapter(registry: IndexedRegistryName): TrialRegistryAdapter {
  return registry === "TFDA" ? new TfdaAdapter() : new ClinicalTrialsGovAdapter();
}

/**
 * Searches the shared public index and, per registry, falls back to a live
 * registry query only for sources the index cannot serve yet. One synchronized
 * source no longer silences the other, and a hosted deployment can disable the
 * TFDA live download entirely.
 */
export async function searchTrialCatalog(
  input: TrialSearchInput,
  registryConditions: Partial<Record<RegistryName, string>> = {},
  runtime: CatalogRuntime = {},
  adapters?: TrialRegistryAdapter[],
): Promise<FederatedTrialSearchResult> {
  if (adapters) return searchTrialRegistries(input, adapters, registryConditions, runtime);

  let health: TrialIndexHealth | undefined;
  let indexed: TrialIndexSearchResult | undefined;
  let indexDurationMs = 0;
  try {
    const store = runtime.store ?? getTrialIndexStore();
    health = await store.health();
    if (health.totalRecords > 0) {
      const startedAt = performance.now();
      indexed = await store.search({
        ...input,
        terms: [input.condition, ...Object.values(registryConditions), ...(await expandWithNciTerminology(registryConditions["ClinicalTrials.gov"] ?? input.condition))].filter((term): term is string => Boolean(term)),
      });
      indexDurationMs = Math.max(0, Math.round(performance.now() - startedAt));
    }
    if (indexAccessState.status !== "ok") indexAccessState = { status: "ok" };
  } catch (error) {
    // A missing or temporarily unavailable index must not erase the bounded
    // live fallback, but the fallback must not be silent either.
    recordIndexProblem(error);
    health = undefined;
    indexed = undefined;
  }
  runtime.signal?.throwIfAborted();

  const servedByIndex = new Set<IndexedRegistryName>();
  const trials: FederatedTrialSearchResult["trials"] = [];
  const sources: FederatedTrialSearchResult["sources"] = [];
  const failures: FederatedTrialSearchResult["failures"] = [];

  if (indexed && health) {
    for (const source of indexed.sources) {
      if (source.recordCount === 0 || source.status === "never_synced") continue;
      servedByIndex.add(source.registry as IndexedRegistryName);
      sources.push({
        registry: source.registry,
        count: indexed.trials.filter((trial) => trial.sources.some((candidate) => candidate.registry === source.registry)).length,
        retrievedAt: indexed.searchedAt,
        sourceVersion: source.sourceVersion,
        warning: source.status === "stale" || source.status === "failed" ? `The ${source.registry} index is ${source.status}; the last successful public snapshot remains searchable.` : undefined,
        durationMs: indexDurationMs,
        dataState: { mode: "indexed" as const, loadedAt: source.lastSuccessAt ?? indexed.searchedAt, storage: indexed.backend },
      });
    }
    trials.push(...indexed.trials.filter((trial) => trial.sources.some((candidate) => servedByIndex.has(candidate.registry as IndexedRegistryName))));
  }

  const liveRegistries = trackedRegistries.filter((registry) => !servedByIndex.has(registry));
  const tfdaLive = runtime.tfdaLiveFallback ?? tfdaLiveFallbackEnabled();
  const liveAdapters: TrialRegistryAdapter[] = [];
  for (const registry of liveRegistries) {
    if (registry === "TFDA" && !tfdaLive) {
      failures.push({
        registry,
        message: "TFDA live fallback is disabled on this deployment and the public index has not synchronized this source yet.",
        code: "SOURCE_UNAVAILABLE",
        durationMs: 0,
      });
      continue;
    }
    liveAdapters.push((runtime.liveAdapterFactory ?? defaultLiveAdapter)(registry));
  }
  if (liveAdapters.length > 0) {
    const live = await searchTrialRegistries(input, liveAdapters, registryConditions, runtime);
    trials.push(...live.trials);
    sources.push(...live.sources);
    failures.push(...live.failures);
  }

  return { trials: rankTrials(deduplicateTrials(trials)), sources, failures };
}
