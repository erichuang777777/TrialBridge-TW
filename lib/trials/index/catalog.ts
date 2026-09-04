import { ClinicalTrialsGovAdapter } from "../adapters/clinicalTrialsGov.ts";
import { TfdaAdapter } from "../adapters/tfda.ts";
import { deduplicateTrials } from "../dedupe.ts";
import { rankTrials } from "../regions.ts";
import { formatRegistryDuration, registrySourceTimeoutMs, resolveTrialSearchDeadlineMs } from "../reliability.ts";
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

function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "TimeoutError";
}

function classifyIndexFailure(error: unknown): string {
  if (isTimeoutError(error)) return "index_timeout";
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

/** Below this remaining budget a live registry query cannot finish; fail fast instead. */
const minimumLiveFallbackBudgetMs = 1_000;

/**
 * Resolves `work` or rejects with a `TimeoutError` DOMException once
 * `timeoutMs` elapses (or the caller's signal aborts). The underlying index
 * request is abandoned, not cancelled: the point is to answer the HTTP
 * request before the hosting platform cuts it off.
 */
function withDeadline<T>(work: () => Promise<T>, timeoutMs: number, outer?: AbortSignal): Promise<T> {
  const deadline = new AbortController();
  const signal = outer ? AbortSignal.any([outer, deadline.signal]) : deadline.signal;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      deadline.abort(new DOMException(`The public index did not respond within ${formatRegistryDuration(timeoutMs)}`, "TimeoutError"));
    }, timeoutMs);
    const settle = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      settle();
      reject(signal.reason);
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    work().then((value) => { settle(); resolve(value); }, (error) => { settle(); reject(error); });
  });
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

  const now = runtime.now ?? (() => performance.now());
  const deadlineMs = Math.max(1, Math.round(runtime.timeoutMs ?? resolveTrialSearchDeadlineMs()));
  const startedAt = now();
  const elapsedMs = () => Math.max(0, Math.round(now() - startedAt));
  let health: TrialIndexHealth | undefined;
  let indexed: TrialIndexSearchResult | undefined;
  let indexDurationMs = 0;
  let indexTimedOut = false;
  try {
    const store = runtime.store ?? getTrialIndexStore();
    const outcome = await withDeadline(async () => {
      const currentHealth = await store.health();
      if (currentHealth.totalRecords === 0) return { health: currentHealth, searched: undefined };
      const searched = await store.search({
        ...input,
        terms: [input.condition, ...Object.values(registryConditions), ...(await expandWithNciTerminology(registryConditions["ClinicalTrials.gov"] ?? input.condition))].filter((term): term is string => Boolean(term)),
      });
      return { health: currentHealth, searched };
    }, deadlineMs, runtime.signal);
    health = outcome.health;
    indexed = outcome.searched;
    indexDurationMs = elapsedMs();
    if (indexAccessState.status !== "ok") indexAccessState = { status: "ok" };
  } catch (error) {
    // A missing, slow, or temporarily unavailable index must not erase the
    // bounded live fallback, but the fallback must not be silent either.
    if (!runtime.signal?.aborted) {
      recordIndexProblem(error);
      indexTimedOut = isTimeoutError(error);
    }
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
  const remainingMs = Math.max(0, deadlineMs - elapsedMs());
  const liveAdapters: TrialRegistryAdapter[] = [];
  for (const registry of liveRegistries) {
    // The whole request shares one deadline: after a slow index there is no
    // budget left for a live registry round trip, so say so instead of
    // letting the hosting platform return an opaque 504.
    if (indexTimedOut || remainingMs < minimumLiveFallbackBudgetMs) {
      failures.push({
        registry,
        message: indexTimedOut
          ? `The public index did not respond within ${formatRegistryDuration(deadlineMs)}; no live registry query fits in the remaining request budget.`
          : `The public index used this request's ${formatRegistryDuration(deadlineMs)} budget; no live registry query was attempted.`,
        code: "SOURCE_TIMEOUT",
        durationMs: elapsedMs(),
      });
      continue;
    }
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
    const live = await searchTrialRegistries(input, liveAdapters, registryConditions, {
      ...runtime,
      timeoutMs: Math.min(runtime.timeoutMs ?? registrySourceTimeoutMs, remainingMs),
    });
    trials.push(...live.trials);
    sources.push(...live.sources);
    failures.push(...live.failures);
  }

  return { trials: rankTrials(deduplicateTrials(trials)), sources, failures };
}
