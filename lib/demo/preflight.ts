import { CloudProbeError, probeCloudModel } from "../llm/cloudProbe.ts";
import { createRegistryQueryPlan } from "../trials/queryBridge.ts";
import { searchTrialRegistries, type FederatedTrialSearchResult } from "../trials/search.ts";

export const competitionPreflightCondition = "gastric cancer";
export const competitionPreflightTimeoutMs = 30_000;

type CloudProbeResult = Awaited<ReturnType<typeof probeCloudModel>>;

export type CompetitionPreflightReceipt = {
  status: "ready" | "partial" | "unavailable";
  checkedAt: string;
  latencyMs: number;
  timeoutMs: number;
  fixedInput: {
    cloudProbe: "built-in synthetic availability prompt";
    registryCondition: typeof competitionPreflightCondition;
  };
  cloud: ({ state: "ready" } & Pick<CloudProbeResult, "requestedModel" | "reportedModel" | "transport" | "inference" | "latencyMs">) | {
    state: "unavailable";
    code: "CLOUD_PROBE_TIMEOUT" | "CLOUD_PROBE_UNAVAILABLE" | "CLOUD_PROBE_INVALID_RESPONSE";
  };
  registries: {
    state: "ready" | "partial" | "unavailable";
    sources: Array<{
      registry: string;
      count: number;
      durationMs: number;
      dataState: FederatedTrialSearchResult["sources"][number]["dataState"];
    }>;
    failures: Array<Pick<FederatedTrialSearchResult["failures"][number], "registry" | "code" | "durationMs">>;
  };
  persisted: false;
  containsHealthInformation: false;
  storesModelContent: false;
  returnsTrialRecords: false;
  evidenceBoundary: "demo_readiness_not_webmcp_or_clinical_validation";
};

type PreflightOptions = {
  signal?: AbortSignal;
  now?: () => number;
  checkedAt?: () => Date;
  runCloud?: (signal?: AbortSignal) => Promise<CloudProbeResult>;
  runRegistries?: (signal?: AbortSignal) => Promise<FederatedTrialSearchResult>;
};

export async function runCompetitionPreflight(options: PreflightOptions = {}): Promise<CompetitionPreflightReceipt> {
  const now = options.now ?? (() => performance.now());
  const checkedAt = options.checkedAt ?? (() => new Date());
  const runCloud = options.runCloud ?? ((signal) => probeCloudModel({ signal }));
  const queryPlan = createRegistryQueryPlan(competitionPreflightCondition);
  const runRegistries = options.runRegistries ?? ((signal) => searchTrialRegistries(
    { condition: competitionPreflightCondition, pageSize: 3, includeNotOpen: false },
    undefined,
    queryPlan.registryConditions,
    { signal },
  ));
  const startedAt = now();
  const [cloudResult, registryResult] = await Promise.allSettled([
    runCloud(options.signal),
    runRegistries(options.signal),
  ]);
  options.signal?.throwIfAborted();

  const cloud: CompetitionPreflightReceipt["cloud"] = cloudResult.status === "fulfilled"
    ? {
      state: "ready",
      requestedModel: cloudResult.value.requestedModel,
      reportedModel: cloudResult.value.reportedModel,
      transport: cloudResult.value.transport,
      inference: cloudResult.value.inference,
      latencyMs: cloudResult.value.latencyMs,
    }
    : {
      state: "unavailable",
      code: cloudResult.reason instanceof CloudProbeError ? cloudResult.reason.code : "CLOUD_PROBE_UNAVAILABLE",
    };

  const registryValue = registryResult.status === "fulfilled" ? registryResult.value : { sources: [], failures: [] };
  const registryState = registryValue.sources.length === 2 && registryValue.failures.length === 0
    ? "ready"
    : registryValue.sources.length > 0
      ? "partial"
      : "unavailable";
  const status = cloud.state === "ready" && registryState === "ready"
    ? "ready"
    : cloud.state === "ready" || registryState !== "unavailable"
      ? "partial"
      : "unavailable";

  return {
    status,
    checkedAt: checkedAt().toISOString(),
    latencyMs: Math.max(0, Math.round(now() - startedAt)),
    timeoutMs: competitionPreflightTimeoutMs,
    fixedInput: {
      cloudProbe: "built-in synthetic availability prompt",
      registryCondition: competitionPreflightCondition,
    },
    cloud,
    registries: {
      state: registryState,
      sources: registryValue.sources.map((source) => ({
        registry: source.registry,
        count: source.count,
        durationMs: source.durationMs,
        dataState: source.dataState,
      })),
      failures: registryValue.failures.map((failure) => ({
        registry: failure.registry,
        code: failure.code,
        durationMs: failure.durationMs,
      })),
    },
    persisted: false,
    containsHealthInformation: false,
    storesModelContent: false,
    returnsTrialRecords: false,
    evidenceBoundary: "demo_readiness_not_webmcp_or_clinical_validation",
  };
}
