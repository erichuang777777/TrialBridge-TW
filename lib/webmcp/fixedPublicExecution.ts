/// <reference types="webmcp-types" />

export const fixedPublicSearchCondition = "胃癌";
export const fixedPublicExecutionTimeoutMs = 25_000;

export const fixedPublicExecutionContract = {
  schemaVersion: "1.0",
  artifactClass: "fixed_public_browser_execution_not_agent_or_inspector_evidence",
  toolName: "search_public_cancer_trials",
  condition: fixedPublicSearchCondition,
  timeoutMs: fixedPublicExecutionTimeoutMs,
  behavior: {
    acceptsFreeText: false,
    executesOnlyFixedPublicSearch: true,
    changesWorkflowState: false,
    persistsResult: false,
  },
  privacyBoundary: {
    containsHealthInformation: false,
    readsPatientContext: false,
    storesExecutionResult: false,
  },
  evidenceBoundary: "Site-orchestrated execution through the current browser WebMCP API. This is not natural-language Inspector or external-agent evidence.",
} as const;

export type FixedPublicExecutionReceipt = {
  schemaVersion: "1.0";
  state: "complete" | "partial";
  toolName: "search_public_cancer_trials";
  fixedCondition: typeof fixedPublicSearchCondition;
  browserApiUsed: true;
  compatibilityProfile: "object_input" | "serialized_input";
  recordCount: number;
  completeness: "complete" | "partial" | "unavailable";
  registryConditions: { TFDA: string; "ClinicalTrials.gov": string };
  completedSources: Array<{ registry: string; count: number }>;
  failedSources: number;
  records: Array<{ title: string; region?: string }>;
  containsHealthInformation: false;
  persisted: false;
  checkedAt: string;
};

type ExecuteContext = Pick<WebMCP.ModelContext, "executeTool">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, max) : undefined;
}

function boundedCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100_000, Math.trunc(value))) : 0;
}

function parsedOutput(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isRecord(parsed)) return parsed;
    } catch {
      throw new Error("WebMCP public execution returned non-JSON text.");
    }
  }
  if (isRecord(value)) return value;
  throw new Error("WebMCP public execution returned an invalid result shape.");
}

async function executeCompat(modelContext: ExecuteContext, tool: WebMCP.RegisteredTool, input: Record<string, unknown>, signal?: AbortSignal) {
  try {
    return { output: await modelContext.executeTool(tool, input, { signal }), compatibilityProfile: "object_input" as const };
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    if (!(error instanceof TypeError)) throw error;
    return { output: await modelContext.executeTool(tool, JSON.stringify(input), { signal }), compatibilityProfile: "serialized_input" as const };
  }
}

export async function executeFixedPublicSearchToolCompat(modelContext: ExecuteContext, tool: WebMCP.RegisteredTool, signal?: AbortSignal) {
  if (tool.name !== fixedPublicExecutionContract.toolName || tool.annotations?.readOnlyHint !== true || tool.annotations?.untrustedContentHint !== true) {
    throw new Error("Fixed execution is restricted to the read-only, untrusted-content public search tool.");
  }
  return executeCompat(modelContext, tool, { condition: fixedPublicSearchCondition }, signal);
}

export function createFixedPublicExecutionReceipt(value: unknown, compatibilityProfile: FixedPublicExecutionReceipt["compatibilityProfile"], checkedAt = new Date().toISOString()): FixedPublicExecutionReceipt {
  const output = parsedOutput(value);
  if (output.truncated === true) throw new Error("WebMCP public execution output was truncated before its receipt could be verified.");
  if (output.query !== fixedPublicSearchCondition) throw new Error("WebMCP public execution did not preserve the fixed public condition.");

  const plan = isRecord(output.queryPlan) ? output.queryPlan : {};
  const registryConditions = isRecord(plan.registryConditions) ? plan.registryConditions : {};
  const tfda = boundedText(registryConditions.TFDA, 120);
  const ctgov = boundedText(registryConditions["ClinicalTrials.gov"], 120);
  if (!tfda || !ctgov) throw new Error("WebMCP public execution returned no verifiable bilingual query plan.");

  const sourceStatus = isRecord(output.sourceStatus) ? output.sourceStatus : {};
  const completedSources = Array.isArray(sourceStatus.completed) ? sourceStatus.completed.slice(0, 2).flatMap((source) => {
    if (!isRecord(source)) return [];
    const registry = boundedText(source.registry, 60);
    return registry ? [{ registry, count: boundedCount(source.count) }] : [];
  }) : [];
  const failedSources = Array.isArray(sourceStatus.failed) ? Math.min(2, sourceStatus.failed.length) : 0;
  const completeness = output.completeness === "complete" || output.completeness === "partial" || output.completeness === "unavailable" ? output.completeness : "unavailable";
  const records = Array.isArray(output.records) ? output.records.slice(0, 3).flatMap((record) => {
    if (!isRecord(record)) return [];
    const title = boundedText(record.title, 140);
    const region = boundedText(record.region, 40);
    return title ? [{ title, ...(region ? { region } : {}) }] : [];
  }) : [];

  return {
    schemaVersion: "1.0",
    state: completeness === "complete" ? "complete" : "partial",
    toolName: fixedPublicExecutionContract.toolName,
    fixedCondition: fixedPublicSearchCondition,
    browserApiUsed: true,
    compatibilityProfile,
    recordCount: boundedCount(output.recordCount),
    completeness,
    registryConditions: { TFDA: tfda, "ClinicalTrials.gov": ctgov },
    completedSources,
    failedSources,
    records,
    containsHealthInformation: false,
    persisted: false,
    checkedAt,
  };
}
