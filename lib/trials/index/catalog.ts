import { deduplicateTrials } from "../dedupe.ts";
import { rankTrials } from "../regions.ts";
import { searchTrialRegistries, type FederatedTrialSearchResult } from "../search.ts";
import type { RegistryName, TrialRegistryAdapter, TrialSearchInput } from "../types.ts";
import { getTrialIndexStore } from "./store.ts";
import { expandWithNciTerminology } from "../terminology/nci.ts";

interface CatalogRuntime {
  signal?: AbortSignal;
  timeoutMs?: number;
  now?: () => number;
}

export async function searchTrialCatalog(
  input: TrialSearchInput,
  registryConditions: Partial<Record<RegistryName, string>> = {},
  runtime: CatalogRuntime = {},
  adapters?: TrialRegistryAdapter[],
): Promise<FederatedTrialSearchResult> {
  if (adapters) return searchTrialRegistries(input, adapters, registryConditions, runtime);
  try {
    const store = getTrialIndexStore();
    const health = await store.health();
    if (health.totalRecords > 0) {
      const startedAt = performance.now();
      const indexed = await store.search({
        ...input,
        terms: [input.condition, ...Object.values(registryConditions), ...(await expandWithNciTerminology(registryConditions["ClinicalTrials.gov"] ?? input.condition))].filter((term): term is string => Boolean(term)),
      });
      runtime.signal?.throwIfAborted();
      const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
      const sources = indexed.sources.filter((source) => source.recordCount > 0).map((source) => ({
        registry: source.registry,
        count: indexed.trials.filter((trial) => trial.sources.some((candidate) => candidate.registry === source.registry)).length,
        retrievedAt: indexed.searchedAt,
        sourceVersion: source.sourceVersion,
        warning: source.status === "stale" || source.status === "failed" ? `The ${source.registry} index is ${source.status}; the last successful public snapshot remains searchable.` : undefined,
        durationMs,
        dataState: { mode: "indexed" as const, loadedAt: source.lastSuccessAt ?? indexed.searchedAt, storage: indexed.backend },
      }));
      const failures = indexed.sources.filter((source) => source.recordCount === 0 || source.status === "never_synced").map((source) => ({
        registry: source.registry,
        message: "This source has not completed its first local index synchronization.",
        code: "SOURCE_UNAVAILABLE" as const,
        durationMs: 0,
      }));
      return { trials: rankTrials(deduplicateTrials(indexed.trials)), sources, failures };
    }
  } catch {
    // A missing or temporarily unavailable local index must not erase the
    // existing bounded live-source fallback during development/recovery.
  }
  return searchTrialRegistries(input, undefined, registryConditions, runtime);
}
