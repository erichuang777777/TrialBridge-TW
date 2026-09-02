import type { NormalizedTrial, TrialDataState } from "../trials/types.ts";
import type { RegistryQueryPlan } from "../trials/queryBridge.ts";
import { capWebMcpOutput, maxWebMcpOutputChars } from "./output.ts";

export function createBoundedPublicSearchOutput({
  query,
  queryPlan,
  trials,
  sources = [],
  failures = [],
  limitation,
}: {
  query: string;
  queryPlan?: RegistryQueryPlan;
  trials: NormalizedTrial[];
  sources?: Array<{ registry: string; count: number; retrievedAt: string; durationMs?: number; dataState?: TrialDataState }>;
  failures?: Array<{ registry: string; message: string; code?: "SOURCE_TIMEOUT" | "SOURCE_UNAVAILABLE"; durationMs?: number }>;
  limitation?: string;
}): unknown {
  const compactPlan = queryPlan ? {
    strategy: queryPlan.strategy,
    canonicalGroup: queryPlan.canonicalGroup,
    dictionaryVersion: queryPlan.dictionaryVersion,
    registryConditions: queryPlan.registryConditions,
    mappingLimitation: queryPlan.limitation,
  } : undefined;
  const candidateRecords = trials.slice(0, 5).map((trial) => ({
    id: trial.canonicalId,
    title: trial.title,
    region: trial.regionTier,
    recruitment: trial.recruitment.raw,
    sources: trial.sources.map((source) => ({ registry: source.registry, id: source.registryId, url: source.url, retrievedAt: source.retrievedAt })),
  }));
  const records = [...candidateRecords];
  let output = {
    query,
    queryPlan: compactPlan,
    recordCount: trials.length,
    completeness: failures.length > 0 ? (sources.length > 0 ? "partial" : "unavailable") : "complete",
    sourceStatus: {
      completed: sources.map((source) => ({ registry: source.registry, count: source.count, retrievedAt: source.retrievedAt, ...(source.durationMs !== undefined ? { durationMs: source.durationMs } : {}), ...(source.dataState ? { dataState: source.dataState } : {}) })),
      failed: failures,
    },
    records,
    omittedRecords: Math.max(0, trials.length - records.length),
    untrustedExternalRegistryContent: true,
    limitation,
  };
  while (JSON.stringify(output).length > maxWebMcpOutputChars && records.length > 0) {
    records.pop();
    output = { ...output, records, omittedRecords: trials.length - records.length };
  }
  return capWebMcpOutput(output);
}
