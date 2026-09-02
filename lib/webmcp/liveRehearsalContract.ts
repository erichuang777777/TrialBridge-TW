import { webMcpJourneyCases, type WebMcpJourneyCase } from "../../evals/webmcp-journeys.ts";

export const liveAgentRehearsalScenarioIds = [
  "method-direct-en",
  "search-direct-zh",
  "shortlist-direct-en",
  "forbidden-enroll-en",
] as const;

export type LiveAgentRehearsalScenarioId = typeof liveAgentRehearsalScenarioIds[number];

const labels: Record<LiveAgentRehearsalScenarioId, { label: string; stateLabel: string }> = {
  "method-direct-en": { label: "Understand the method", stateLabel: "Public page" },
  "search-direct-zh": { label: "Bilingual trial search", stateLabel: "Public page" },
  "shortlist-direct-en": { label: "Compare a shortlist", stateLabel: "Synthetic shortlist" },
  "forbidden-enroll-en": { label: "Refuse enrollment authority", stateLabel: "Synthetic results" },
};

function requiredJourneyCase(id: LiveAgentRehearsalScenarioId): WebMcpJourneyCase {
  const journey = webMcpJourneyCases.find((candidate) => candidate.id === id);
  if (!journey) throw new Error(`Missing WebMCP rehearsal journey: ${id}`);
  return journey;
}

export const liveAgentRehearsalScenarios = liveAgentRehearsalScenarioIds.map((id) => {
  const journey = requiredJourneyCase(id);
  return { ...journey, id, ...labels[id] };
});

export const liveAgentRehearsalContract = {
  schemaVersion: "1.0",
  artifactClass: "live_model_selection_rehearsal_definition_not_browser_evidence",
  route: "/api/demo/webmcp-rehearsal",
  model: "gpt-oss:120b-cloud",
  transport: "localhost_ollama_proxy",
  fixedScenarioIds: liveAgentRehearsalScenarioIds,
  timeoutMs: 30_000,
  sharedRateLimit: { checks: 3, windowMinutes: 10, bucket: "cloud-probe" },
  behavior: {
    acceptsFreeText: false,
    executesSelectedTool: false,
    changesWorkflowState: false,
    persistsResult: false,
  },
  privacyBoundary: {
    containsHealthInformation: false,
    sendsPatientContent: false,
    storesModelContentOrThinking: false,
  },
  evidenceBoundary: "Live synthetic model-to-tool selection only. It does not prove Chrome registration, tool execution, Inspector behavior, or clinical quality.",
} as const;

export type LiveAgentRehearsalReceipt = {
  schemaVersion: "1.0";
  state: "passed" | "finding" | "unavailable";
  scenarioId: LiveAgentRehearsalScenarioId;
  expectedTools: string[];
  selectedTools: string[];
  expectedAbstention: boolean;
  argumentsChecked: boolean;
  latencyMs: number;
  checkedAt: string;
  requestedModel: "gpt-oss:120b-cloud";
  reportedModel?: string;
  findingCodes: Array<"TOOL_SELECTION_MISMATCH" | "ARGUMENT_MISMATCH" | "MODEL_TIMEOUT" | "MODEL_UNAVAILABLE">;
  executesSelectedTool: false;
  containsHealthInformation: false;
  storesModelContentOrThinking: false;
  persisted: false;
};
