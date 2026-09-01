import { ClinicalTrialsGovAdapter } from "./adapters/clinicalTrialsGov.ts";
import { TfdaAdapter } from "./adapters/tfda.ts";
import { deduplicateTrials } from "./dedupe.ts";
import { rankTrials } from "./regions.ts";
import { formatRegistryDuration, registrySourceTimeoutMs } from "./reliability.ts";
import type { NormalizedTrial, RegistryName, TrialAdapterResult, TrialRegistryAdapter, TrialSearchInput } from "./types.ts";

export interface RegistrySearchFailure {
  registry: string;
  message: string;
  code: "SOURCE_TIMEOUT" | "SOURCE_UNAVAILABLE";
  durationMs: number;
}

export interface FederatedTrialSearchResult {
  trials: ReturnType<typeof rankTrials>;
  sources: Array<{
    registry: string;
    count: number;
    retrievedAt: string;
    sourceVersion?: string;
    warning?: string;
    durationMs: number;
    dataState: {
      mode: "live" | "fresh_cache" | "stale_cache";
      loadedAt: string;
    };
  }>;
  failures: RegistrySearchFailure[];
}

interface RegistrySearchRuntime {
  timeoutMs?: number;
  now?: () => number;
}

type TimedAdapterSearch =
  | { status: "fulfilled"; value: TrialAdapterResult; durationMs: number }
  | { status: "rejected"; reason: unknown; durationMs: number; timedOut: boolean };

function runAdapterWithDeadline(
  adapter: TrialRegistryAdapter,
  input: TrialSearchInput,
  condition: string,
  runtime: RegistrySearchRuntime,
): Promise<TimedAdapterSearch> {
  const timeoutMs = Math.max(1, Math.round(runtime.timeoutMs ?? registrySourceTimeoutMs));
  const now = runtime.now ?? (() => performance.now());
  const startedAt = now();
  const controller = new AbortController();

  return new Promise((resolve) => {
    let finished = false;
    const finish = (result: TimedAdapterSearch) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      controller.abort(new DOMException("Registry source deadline reached", "TimeoutError"));
      finish({ status: "rejected", reason: controller.signal.reason, durationMs: timeoutMs, timedOut: true });
    }, timeoutMs);

    void Promise.resolve()
      .then(() => adapter.search({ ...input, condition }, { signal: controller.signal }))
      .then((value) => finish({ status: "fulfilled", value, durationMs: Math.max(0, Math.round(now() - startedAt)) }))
      .catch((reason) => finish({ status: "rejected", reason, durationMs: Math.max(0, Math.round(now() - startedAt)), timedOut: false }));
  });
}

function publicError(error: unknown): string {
  if (error instanceof Error && /returned HTTP \d{3}/.test(error.message)) return error.message;
  return "Registry temporarily unavailable";
}

export async function searchTrialRegistries(
  input: TrialSearchInput,
  adapters: TrialRegistryAdapter[] = [new TfdaAdapter(), new ClinicalTrialsGovAdapter()],
  registryConditions: Partial<Record<RegistryName, string>> = {},
  runtime: RegistrySearchRuntime = {},
): Promise<FederatedTrialSearchResult> {
  const settled = await Promise.all(adapters.map((adapter) => runAdapterWithDeadline(
    adapter,
    input,
    registryConditions[adapter.registry] ?? input.condition,
    runtime,
  )));
  const trials: NormalizedTrial[] = [];
  const sources: FederatedTrialSearchResult["sources"] = [];
  const failures: RegistrySearchFailure[] = [];

  settled.forEach((result, index) => {
    const registry = adapters[index].registry;
    if (result.status === "rejected") {
      failures.push({
        registry,
        message: result.timedOut ? `Source did not respond within ${formatRegistryDuration(result.durationMs)}` : publicError(result.reason),
        code: result.timedOut ? "SOURCE_TIMEOUT" : "SOURCE_UNAVAILABLE",
        durationMs: result.durationMs,
      });
      return;
    }
    trials.push(...result.value.trials);
    sources.push({
      registry,
      count: result.value.trials.length,
      retrievedAt: result.value.retrievedAt,
      sourceVersion: result.value.sourceVersion,
      warning: result.value.warning,
      durationMs: result.durationMs,
      dataState: result.value.dataState,
    });
  });

  return { trials: rankTrials(deduplicateTrials(trials)), sources, failures };
}
