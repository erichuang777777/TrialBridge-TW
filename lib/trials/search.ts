import { ClinicalTrialsGovAdapter } from "./adapters/clinicalTrialsGov.ts";
import { TfdaAdapter } from "./adapters/tfda.ts";
import { deduplicateTrials } from "./dedupe.ts";
import { rankTrials } from "./regions.ts";
import { formatRegistryDuration, registrySourceTimeoutMs } from "./reliability.ts";
import type { NormalizedTrial, RegistryName, TrialAdapterResult, TrialDataState, TrialRegistryAdapter, TrialSearchInput } from "./types.ts";

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
    dataState: TrialDataState;
  }>;
  failures: RegistrySearchFailure[];
}

interface RegistrySearchRuntime {
  timeoutMs?: number;
  now?: () => number;
  signal?: AbortSignal;
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
  const deadlineController = new AbortController();
  const signal = runtime.signal ? AbortSignal.any([runtime.signal, deadlineController.signal]) : deadlineController.signal;

  return new Promise((resolve) => {
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: TimedAdapterSearch) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = () => finish({
      status: "rejected",
      reason: signal.reason,
      durationMs: deadlineController.signal.aborted && !runtime.signal?.aborted ? timeoutMs : Math.max(0, Math.round(now() - startedAt)),
      timedOut: deadlineController.signal.aborted && !runtime.signal?.aborted,
    });
    timer = setTimeout(() => {
      deadlineController.abort(new DOMException("Registry source deadline reached", "TimeoutError"));
    }, timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }

    void Promise.resolve()
      .then(() => adapter.search({ ...input, condition }, { signal }))
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
  runtime.signal?.throwIfAborted();
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
