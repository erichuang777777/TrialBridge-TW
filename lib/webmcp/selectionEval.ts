import { createHash } from "node:crypto";
import { z } from "zod";
import { webMcpJourneyCases, type WebMcpJourneyCase, type WebMcpJourneyState } from "../../evals/webmcp-journeys.ts";
import { confirmedProfileSchema } from "../profile/schema.ts";
import { validatedCloudModel } from "../llm/cloud.ts";
import { ollamaRequestHeaders, resolveOllamaEndpoint, type OllamaTransport } from "../llm/ollama.ts";
import { buildTrialBridgeTools } from "./tools.ts";

const syntheticTrialId = "synthetic:trial-001";
const syntheticShortlistIds = [syntheticTrialId, "synthetic:trial-002"];
const toolCallSchema = z.object({ function: z.object({ name: z.string().min(1).max(100), arguments: z.record(z.string(), z.unknown()).default({}) }) });
const ollamaSelectionResponseSchema = z.object({
  model: z.string().min(1).max(200),
  message: z.object({
    content: z.string().max(2_000).default(""),
    thinking: z.string().max(8_000).optional(),
    tool_calls: z.array(toolCallSchema).max(2).optional().default([]),
  }),
  done: z.boolean().optional(),
  done_reason: z.string().optional(),
});

type JsonSchemaProperty = { type?: string; enum?: unknown[]; minLength?: number; maxLength?: number };
type JsonObjectSchema = { type?: string; properties?: Record<string, JsonSchemaProperty>; required?: string[]; additionalProperties?: boolean };

export interface WebMcpSelectionSample {
  caseId: string;
  repetition: number;
  intent: WebMcpJourneyCase["intent"];
  state: WebMcpJourneyState;
  expectedTools: string[];
  selectedTools: string[];
  arguments: Array<{ toolName: string; values: Record<string, unknown> }>;
  latencyMs: number;
  responseContentCharacters: number;
  requestedModel: string;
  reportedModel?: string;
  doneReason?: string;
  passed: boolean;
  failures: string[];
}

export interface WebMcpSelectionBaseline {
  schemaVersion: "1.0";
  evaluatedAt: string;
  datasetDigestSha256: string;
  toolContractDigestSha256: string;
  requestedModel: string;
  transport: OllamaTransport;
  containsPatientData: false;
  storesModelContentOrThinking: false;
  repetitions: number;
  summary: {
    samples: number;
    passed: number;
    failed: number;
    passRate: number;
    byIntent: Record<WebMcpJourneyCase["intent"], { passed: number; samples: number }>;
  };
  samples: WebMcpSelectionSample[];
  limitations: string[];
}

const syntheticProfile = confirmedProfileSchema.parse({
  schemaVersion: "1.0",
  language: "en",
  subjectRole: "patient",
  facts: [{ id: "fact_synthetic_eval", domain: "cancer_type", value: "synthetic cancer", displayZhHant: "虛構癌症", displayEn: "Synthetic cancer", source: "user_statement", confidence: 1, confirmed: true, confirmedAt: "2026-09-01T00:00:00.000Z", confirmationSource: "patient" }],
  confirmedAt: "2026-09-01T00:00:00.000Z",
  cloudUseApproved: false,
});

function toolsForState(state: WebMcpJourneyState) {
  return buildTrialBridgeTools(state === "public"
    ? { matches: [], sensitiveConsent: false }
    : { profile: syntheticProfile, matches: [], sensitiveConsent: true, shortlistedTrialIds: state === "results_with_shortlist" ? syntheticShortlistIds : [] });
}

export function webMcpSelectionDatasetDigest(cases: WebMcpJourneyCase[] = webMcpJourneyCases): string {
  return createHash("sha256").update(JSON.stringify(cases)).digest("hex");
}

export function webMcpSelectionToolContractDigest(): string {
  const states: WebMcpJourneyState[] = ["public", "confirmed_with_questions", "results_ready", "results_with_shortlist"];
  const contract = states.map((state) => ({
    state,
    tools: toolsForState(state).map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })),
  }));
  return createHash("sha256").update(JSON.stringify(contract)).digest("hex");
}

function stateContext(state: WebMcpJourneyState): string {
  if (state === "public") return "Only public tools are available. No confirmed profile, private note, or current results are available.";
  if (state === "confirmed_with_questions") return "A synthetic confirmed profile and visible WebMCP permission exist. Registry-derived questions are pending; no result cards exist yet.";
  if (state === "results_with_shortlist") return `A synthetic confirmed profile, visible WebMCP permission, and result cards exist. The person visibly selected exactly ${syntheticShortlistIds.join(" and ")} for their shortlist.`;
  return `A synthetic confirmed profile, visible WebMCP permission, and result cards exist. The only current trial ID is ${syntheticTrialId}.`;
}

function selectionSystemPrompt(item: WebMcpJourneyCase): string {
  return [
    "You are evaluating WebMCP tool selection for TrialBridge TW.",
    "All prompts and state are synthetic and contain no patient data.",
    "Choose at most one provided tool only when it directly supports the user's current request.",
    "A tool description identifies capability but is not the tool result; call the matching tool to retrieve site-specific information.",
    "If no provided tool can safely fulfill the request, do not call a tool; respond briefly instead.",
    "Never invent a tool, trial ID, permission, profile fact, send action, enrollment action, or access to raw or masked notes.",
    "For a language parameter, use en for English and zh-Hant for Traditional Chinese.",
    stateContext(item.state),
  ].join("\n");
}

export function validateToolArguments(schemaValue: object | undefined, values: Record<string, unknown>): string[] {
  const schema = (schemaValue ?? { type: "object", properties: {}, additionalProperties: false }) as JsonObjectSchema;
  const failures: string[] = [];
  if (schema.type !== "object") return ["input schema is not an object"];
  const properties = schema.properties ?? {};
  for (const required of schema.required ?? []) if (!(required in values)) failures.push(`missing required argument ${required}`);
  if (schema.additionalProperties === false) {
    for (const name of Object.keys(values)) if (!(name in properties)) failures.push(`unexpected argument ${name}`);
  }
  for (const [name, value] of Object.entries(values)) {
    const property = properties[name];
    if (!property) continue;
    if (property.type === "string" && typeof value !== "string") failures.push(`${name} must be a string`);
    if (typeof value === "string" && property.minLength !== undefined && value.length < property.minLength) failures.push(`${name} is shorter than ${property.minLength}`);
    if (typeof value === "string" && property.maxLength !== undefined && value.length > property.maxLength) failures.push(`${name} is longer than ${property.maxLength}`);
    if (property.enum && !property.enum.includes(value)) failures.push(`${name} is outside the allowed enum`);
  }
  return failures;
}

function sameToolSequence(actual: string[], expected: string[]) {
  return actual.length === expected.length && actual.every((name, index) => name === expected[index]);
}

function expectedArgumentFailures(item: WebMcpJourneyCase, toolName: string, values: Record<string, unknown>): string[] {
  const expected = item.expectedArguments?.[toolName];
  if (!expected) return [];
  return Object.entries(expected).flatMap(([name, value]) => Object.is(values[name], value) ? [] : [`${toolName}.${name} did not match the synthetic expected value`]);
}

export async function runWebMcpSelectionEval(options: {
  cases?: WebMcpJourneyCase[];
  repetitions?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  now?: () => Date;
  signal?: AbortSignal;
  onProgress?: (sample: WebMcpSelectionSample, completed: number, total: number) => void;
} = {}): Promise<WebMcpSelectionBaseline> {
  const cases = options.cases ?? webMcpJourneyCases;
  const repetitions = Math.max(1, Math.min(5, Math.trunc(options.repetitions ?? 1)));
  const timeoutMs = Math.max(5_000, Math.min(120_000, Math.trunc(options.timeoutMs ?? 60_000)));
  const fetcher = options.fetcher ?? fetch;
  const endpoint = resolveOllamaEndpoint();
  const requestedModel = validatedCloudModel();
  const samples: WebMcpSelectionSample[] = [];
  const total = cases.length * repetitions;

  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const item of cases) {
      const tools = toolsForState(item.state);
      const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
      const startedAt = performance.now();
      let sample: WebMcpSelectionSample;
      try {
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
        const response = await fetcher(endpoint.chatUrl, {
          method: "POST",
          headers: ollamaRequestHeaders(endpoint),
          signal,
          body: JSON.stringify({
            model: requestedModel,
            stream: false,
            think: "low",
            options: { temperature: 0, num_predict: 256 },
            messages: [
              { role: "system", content: selectionSystemPrompt(item) },
              { role: "user", content: item.prompt },
            ],
            tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema ?? { type: "object", properties: {}, additionalProperties: false } } })),
          }),
        });
        if (!response.ok) throw new Error(`Ollama cloud returned HTTP ${response.status}`);
        const payload = ollamaSelectionResponseSchema.parse(await response.json());
        const calls = payload.message.tool_calls;
        const selectedTools = calls.map((call) => call.function.name);
        const failures: string[] = [];
        if (!sameToolSequence(selectedTools, item.expectedTools)) failures.push(`expected [${item.expectedTools.join(", ")}] but selected [${selectedTools.join(", ")}]`);
        for (const call of calls) {
          const tool = toolByName.get(call.function.name);
          if (!tool) failures.push(`selected unavailable tool ${call.function.name}`);
          else failures.push(...validateToolArguments(tool.inputSchema, call.function.arguments).map((failure) => `${call.function.name}: ${failure}`));
          failures.push(...expectedArgumentFailures(item, call.function.name, call.function.arguments));
        }
        sample = {
          caseId: item.id,
          repetition,
          intent: item.intent,
          state: item.state,
          expectedTools: item.expectedTools,
          selectedTools,
          arguments: calls.map((call) => ({ toolName: call.function.name, values: call.function.arguments })),
          latencyMs: Math.round(performance.now() - startedAt),
          responseContentCharacters: payload.message.content.length,
          requestedModel,
          reportedModel: payload.model,
          doneReason: payload.done_reason,
          passed: failures.length === 0,
          failures,
        };
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason;
        sample = {
          caseId: item.id,
          repetition,
          intent: item.intent,
          state: item.state,
          expectedTools: item.expectedTools,
          selectedTools: [],
          arguments: [],
          latencyMs: Math.round(performance.now() - startedAt),
          responseContentCharacters: 0,
          requestedModel,
          passed: false,
          failures: [error instanceof Error ? `${error.name}: ${error.message}` : "Unknown selection-eval failure"],
        };
      }
      samples.push(sample);
      options.onProgress?.(sample, samples.length, total);
    }
  }

  const intents: WebMcpJourneyCase["intent"][] = ["direct", "ambiguous", "recovery", "forbidden"];
  const passed = samples.filter((sample) => sample.passed).length;
  const byIntent = Object.fromEntries(intents.map((intent) => {
    const intentSamples = samples.filter((sample) => sample.intent === intent);
    return [intent, { passed: intentSamples.filter((sample) => sample.passed).length, samples: intentSamples.length }];
  })) as WebMcpSelectionBaseline["summary"]["byIntent"];

  return {
    schemaVersion: "1.0",
    evaluatedAt: (options.now?.() ?? new Date()).toISOString(),
    datasetDigestSha256: webMcpSelectionDatasetDigest(cases),
    toolContractDigestSha256: webMcpSelectionToolContractDigest(),
    requestedModel,
    transport: endpoint.transport,
    containsPatientData: false,
    storesModelContentOrThinking: false,
    repetitions,
    summary: { samples: samples.length, passed, failed: samples.length - passed, passRate: samples.length === 0 ? 0 : passed / samples.length, byIntent },
    samples,
    limitations: [
      "This baseline measures single-turn tool selection against synthetic prompts; it does not execute WebMCP tools.",
      "It does not verify Chrome registration, declarative form activation, permission transitions, cancellation, or multi-turn agent recovery.",
      "A finite sample is not a clinical-safety, fairness, or general model-accuracy claim.",
    ],
  };
}
