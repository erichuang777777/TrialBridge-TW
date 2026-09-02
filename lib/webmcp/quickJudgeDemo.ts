export const quickJudgeDemoContract = {
  schemaVersion: "1.0",
  artifactClass: "three_minute_judge_route_definition_not_browser_result",
  route: "/webmcp/quickstart",
  targetMinutes: 3,
  publicToolNames: ["trialbridge_method", "search_public_cancer_trials"],
  safeExecutionTool: "trialbridge_method",
  executionTimeoutMs: 10_000,
  behavior: {
    acceptsFreeText: false,
    runsCloudModel: false,
    runsRegistrySearch: false,
    changesWorkflowState: false,
    persistsResult: false,
  },
  privacyBoundary: {
    containsHealthInformation: false,
    readsPatientContext: false,
    storesExecutionResult: false,
  },
  evidenceBoundary: "A concise current-browser discovery and safe-method check. Full lifecycle, model selection, fixed public search execution, and Inspector acceptance remain separate linked gates.",
} as const;

export type QuickMethodReceipt = {
  schemaVersion: "1.0";
  toolName: "trialbridge_method";
  browserApiUsed: true;
  searchOrder: string[];
  sources: string[];
  privacy: string;
  limitation: string;
  containsHealthInformation: false;
  persisted: false;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, max) : undefined;
}

function boundedStringList(value: unknown, limit: number, itemMax: number): string[] {
  return Array.isArray(value) ? value.slice(0, limit).flatMap((item) => {
    const text = boundedText(item, itemMax);
    return text ? [text] : [];
  }) : [];
}

function parsedResult(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isRecord(parsed)) return parsed;
    } catch {
      throw new Error("Safe method returned non-JSON text.");
    }
  }
  if (isRecord(value)) return value;
  throw new Error("Safe method returned an invalid result shape.");
}

export function createQuickMethodReceipt(value: unknown): QuickMethodReceipt {
  const result = parsedResult(value);
  const searchOrder = boundedStringList(result.searchOrder, 3, 40);
  const sources = boundedStringList(result.sources, 3, 60);
  const privacy = boundedText(result.privacy, 180);
  const limitation = boundedText(result.limitation, 220);
  if (searchOrder.length !== 3 || sources.length < 2 || !privacy || !limitation) {
    throw new Error("Safe method result did not match the bounded TrialBridge contract.");
  }
  return {
    schemaVersion: "1.0",
    toolName: "trialbridge_method",
    browserApiUsed: true,
    searchOrder,
    sources,
    privacy,
    limitation,
    containsHealthInformation: false,
    persisted: false,
  };
}
