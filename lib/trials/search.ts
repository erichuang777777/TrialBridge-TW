import { ClinicalTrialsGovAdapter } from "./adapters/clinicalTrialsGov.ts";
import { TfdaAdapter } from "./adapters/tfda.ts";
import { deduplicateTrials } from "./dedupe.ts";
import { rankTrials } from "./regions.ts";
import type { NormalizedTrial, TrialRegistryAdapter, TrialSearchInput } from "./types.ts";

export interface RegistrySearchFailure {
  registry: string;
  message: string;
}

export interface FederatedTrialSearchResult {
  trials: ReturnType<typeof rankTrials>;
  sources: Array<{
    registry: string;
    count: number;
    retrievedAt: string;
    sourceVersion?: string;
    warning?: string;
  }>;
  failures: RegistrySearchFailure[];
}

function publicError(error: unknown): string {
  if (error instanceof Error && /returned HTTP \d{3}/.test(error.message)) return error.message;
  return "Registry temporarily unavailable";
}

export async function searchTrialRegistries(
  input: TrialSearchInput,
  adapters: TrialRegistryAdapter[] = [new TfdaAdapter(), new ClinicalTrialsGovAdapter()],
): Promise<FederatedTrialSearchResult> {
  const settled = await Promise.allSettled(adapters.map((adapter) => adapter.search(input)));
  const trials: NormalizedTrial[] = [];
  const sources: FederatedTrialSearchResult["sources"] = [];
  const failures: RegistrySearchFailure[] = [];

  settled.forEach((result, index) => {
    const registry = adapters[index].registry;
    if (result.status === "rejected") {
      failures.push({ registry, message: publicError(result.reason) });
      return;
    }
    trials.push(...result.value.trials);
    sources.push({
      registry,
      count: result.value.trials.length,
      retrievedAt: result.value.retrievedAt,
      sourceVersion: result.value.sourceVersion,
      warning: result.value.warning,
    });
  });

  return { trials: rankTrials(deduplicateTrials(trials)), sources, failures };
}
