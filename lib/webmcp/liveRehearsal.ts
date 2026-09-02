import { requiredCloudModel } from "../llm/cloud.ts";
import { runWebMcpSelectionEval } from "./selectionEval.ts";
import { webMcpImperativeContractCore } from "./toolContractCore.ts";
import {
  liveAgentRehearsalScenarios,
  type LiveAgentRehearsalReceipt,
  type LiveAgentRehearsalScenarioId,
} from "./liveRehearsalContract.ts";

const canonicalToolNames = new Set(Object.keys(webMcpImperativeContractCore));

function classifyFindings(failures: string[]): LiveAgentRehearsalReceipt["findingCodes"] {
  const codes = new Set<LiveAgentRehearsalReceipt["findingCodes"][number]>();
  for (const failure of failures) {
    if (/TimeoutError|timed? out|timeout/i.test(failure)) codes.add("MODEL_TIMEOUT");
    else if (/Ollama|HTTP|fetch|network|ZodError|invalid|Error:/i.test(failure)) codes.add("MODEL_UNAVAILABLE");
    if (/expected \[|selected unavailable tool/i.test(failure)) codes.add("TOOL_SELECTION_MISMATCH");
    if (/argument|missing required|unexpected|outside the allowed|shorter than|longer than|must be a string|did not match the synthetic/i.test(failure)) codes.add("ARGUMENT_MISMATCH");
  }
  if (failures.length > 0 && codes.size === 0) codes.add("TOOL_SELECTION_MISMATCH");
  return [...codes];
}

export async function runLiveAgentRehearsal(scenarioId: LiveAgentRehearsalScenarioId, options: {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  now?: () => Date;
} = {}): Promise<LiveAgentRehearsalReceipt> {
  const journey = liveAgentRehearsalScenarios.find((candidate) => candidate.id === scenarioId);
  if (!journey) throw new Error("Unknown live agent rehearsal scenario");
  const baseline = await runWebMcpSelectionEval({
    cases: [journey],
    repetitions: 1,
    timeoutMs: 30_000,
    fetcher: options.fetcher,
    signal: options.signal,
    now: options.now,
  });
  const sample = baseline.samples[0];
  if (!sample) throw new Error("Live agent rehearsal returned no sample");
  const findingCodes = classifyFindings(sample.failures);
  const unavailable = findingCodes.includes("MODEL_TIMEOUT") || findingCodes.includes("MODEL_UNAVAILABLE");
  const selectedTools = sample.selectedTools.map((name) => canonicalToolNames.has(name) ? name : "unknown_capability");
  return {
    schemaVersion: "1.0",
    state: sample.passed ? "passed" : unavailable ? "unavailable" : "finding",
    scenarioId,
    expectedTools: [...journey.expectedTools],
    selectedTools,
    expectedAbstention: journey.expectedTools.length === 0,
    argumentsChecked: sample.selectedTools.length === 0 || !findingCodes.includes("ARGUMENT_MISMATCH"),
    latencyMs: sample.latencyMs,
    checkedAt: (options.now?.() ?? new Date()).toISOString(),
    requestedModel: requiredCloudModel,
    ...(sample.reportedModel ? { reportedModel: sample.reportedModel } : {}),
    findingCodes,
    executesSelectedTool: false,
    containsHealthInformation: false,
    storesModelContentOrThinking: false,
    persisted: false,
  };
}
