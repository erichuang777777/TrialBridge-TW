/// <reference types="webmcp-types" />

import { readFileSync } from "node:fs";
import { buildTrialBridgeTools } from "../lib/webmcp/tools.ts";
import { capWebMcpOutput, maxWebMcpOutputChars } from "../lib/webmcp/output.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";
import { webMcpJourneyCases } from "../evals/webmcp-journeys.ts";
import { requiredCloudModel } from "../lib/llm/cloud.ts";
import { webMcpSelectionDatasetDigest, webMcpSelectionToolContractDigest } from "../lib/webmcp/selectionEval.ts";

const findings: string[] = [];
const draft = profileDraftSchema.parse({
  schemaVersion: "1.0",
  language: "en",
  subjectRole: "patient",
  facts: [{
    id: "fact_conformance_cancer",
    domain: "cancer_type",
    value: "synthetic gastric cancer",
    displayZhHant: "虛構胃癌",
    displayEn: "Synthetic gastric cancer",
    source: "user_statement",
    confidence: 1,
    confirmed: false,
  }],
  missingQuestions: [],
  safetyNote: "Synthetic conformance fixture only.",
});
const profile = confirmProfile(draft, {}, "patient", "2026-09-01T00:00:00.000Z");
const publicTools = buildTrialBridgeTools({ matches: [], sensitiveConsent: false });
const allTools = buildTrialBridgeTools({ profile, matches: [], sensitiveConsent: true });
const names = allTools.map((tool) => tool.name);

function check(condition: boolean, message: string) {
  if (!condition) findings.push(message);
}

check(new Set(names).size === names.length, "Imperative tool names must be unique.");
check(publicTools.length === 2, "Exactly two public imperative tools must remain available without confirmed context.");
check(allTools.length === 6, "Exactly six imperative tools must be available after confirmed-context permission.");

for (const tool of allTools) {
  check(/^[A-Za-z0-9_.-]+$/.test(tool.name), `${tool.name}: name contains unsupported characters.`);
  check(tool.name.length <= 30, `${tool.name}: name exceeds 30 characters.`);
  check(tool.description.length <= 500, `${tool.name}: description exceeds 500 characters.`);
  check(tool.annotations?.readOnlyHint === true, `${tool.name}: readOnlyHint must be true.`);
  check(!/^(?:send|submit|enroll|book|consent|treat)/i.test(tool.name), `${tool.name}: forbidden side-effect authority.`);
  const schema = tool.inputSchema as { type?: string; properties?: Record<string, { description?: string }>; additionalProperties?: boolean };
  check(schema.type === "object", `${tool.name}: input schema must be an object.`);
  check(schema.additionalProperties === false, `${tool.name}: additionalProperties must be false.`);
  for (const [parameterName, parameter] of Object.entries(schema.properties ?? {})) {
    check(parameterName.length <= 30, `${tool.name}.${parameterName}: parameter name exceeds 30 characters.`);
    check(Boolean(parameter.description), `${tool.name}.${parameterName}: parameter description is required.`);
    check((parameter.description?.length ?? 0) <= 150, `${tool.name}.${parameterName}: parameter description exceeds 150 characters.`);
  }
}

for (const toolName of ["search_public_cancer_trials", "review_trial_followups", "explain_confirmed_matches", "draft_trial_outreach", "draft_trial_discussion_brief"]) {
  check(allTools.find((tool) => tool.name === toolName)?.annotations?.untrustedContentHint === true, `${toolName}: registry-derived content must be marked untrusted.`);
}

const metadata = JSON.stringify(allTools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))).toLocaleLowerCase("en");
check(!metadata.includes("rawnote") && !metadata.includes("maskednote"), "Raw or masked note fields must never enter an imperative tool contract.");
check(JSON.stringify(capWebMcpOutput("x".repeat(maxWebMcpOutputChars * 2))).length <= maxWebMcpOutputChars + 32, "Tool-output cap is not effective.");

const knownToolNames = new Set(["search_public_trial_form", ...names]);
check(webMcpJourneyCases.length >= 10, "At least ten WebMCP journey eval cases are required.");
check(webMcpJourneyCases.some((item) => item.intent === "ambiguous"), "Journey evals must include ambiguous prompts.");
check(webMcpJourneyCases.some((item) => item.intent === "recovery"), "Journey evals must include recovery prompts.");
check(webMcpJourneyCases.some((item) => item.intent === "forbidden"), "Journey evals must include forbidden requests.");
for (const item of webMcpJourneyCases) {
  check(item.expectedTools.every((name) => knownToolNames.has(name)), `${item.id}: expected tool is not registered.`);
  check(item.intent === "forbidden" ? item.expectedTools.length === 0 : item.expectedTools.length > 0, `${item.id}: tool expectation does not match intent.`);
}

const selectionBaselineSource = readFileSync("evals/webmcp-selection-baseline.json", "utf8");
const selectionBaseline = JSON.parse(selectionBaselineSource) as {
  datasetDigestSha256: string;
  toolContractDigestSha256: string;
  requestedModel: string;
  transport: string;
  containsPatientData: boolean;
  storesModelContentOrThinking: boolean;
  repetitions: number;
  summary: { samples: number; passed: number; failed: number; passRate: number; byIntent: Record<string, { passed: number; samples: number }> };
  samples: Array<{ caseId: string; intent: string; requestedModel: string; passed: boolean }>;
};
check(selectionBaseline.datasetDigestSha256 === webMcpSelectionDatasetDigest(), "Selection baseline journey digest is stale.");
check(selectionBaseline.toolContractDigestSha256 === webMcpSelectionToolContractDigest(), "Selection baseline tool-contract digest is stale.");
check(selectionBaseline.requestedModel === requiredCloudModel, `Selection baseline must request ${requiredCloudModel}.`);
check(selectionBaseline.transport === "localhost_ollama_proxy", "Selection baseline must use the localhost Ollama proxy.");
check(selectionBaseline.containsPatientData === false, "Selection baseline must contain no patient data.");
check(selectionBaseline.storesModelContentOrThinking === false, "Selection baseline must not store model content or thinking.");
check(!/\"(?:content|thinking)\"\s*:/.test(selectionBaselineSource), "Selection baseline contains a model content or thinking field.");
check(Number.isInteger(selectionBaseline.repetitions) && selectionBaseline.repetitions >= 3, "Selection baseline must contain at least three repetitions.");
check(selectionBaseline.samples.length === webMcpJourneyCases.length * selectionBaseline.repetitions, "Selection baseline sample count does not match cases times repetitions.");
check(selectionBaseline.summary.samples === selectionBaseline.samples.length, "Selection baseline summary sample count is inconsistent.");
check(selectionBaseline.summary.passed + selectionBaseline.summary.failed === selectionBaseline.summary.samples, "Selection baseline pass/fail totals are inconsistent.");
check(selectionBaseline.summary.passRate === selectionBaseline.summary.passed / selectionBaseline.summary.samples, "Selection baseline pass rate is inconsistent.");
const journeyIds = new Set(webMcpJourneyCases.map((item) => item.id));
check(selectionBaseline.samples.every((sample) => journeyIds.has(sample.caseId)), "Selection baseline contains an unknown journey case.");
check(selectionBaseline.samples.every((sample) => sample.requestedModel === requiredCloudModel), "Selection baseline sample requested a non-approved model.");
const forbiddenSamples = selectionBaseline.samples.filter((sample) => sample.intent === "forbidden");
check(forbiddenSamples.length > 0 && forbiddenSamples.every((sample) => sample.passed), "Every recorded forbidden-intent sample must safely abstain.");

const declarative = readFileSync("app/components/TrialDatabase.tsx", "utf8");
for (const marker of ["const declarativeToolName = \"search_public_trial_form\"", "toolname={declarativeToolName}", "tooldescription=", "toolautosubmit=", "toolparamdescription=", "agentInvoked", "respondWith(searchPromise)"]) {
  check(declarative.includes(marker), `Declarative search form is missing ${marker}.`);
}
check((declarative.match(/toolname=/g) ?? []).length === 1, "The public database must expose one visible declarative form tool.");

const bridge = readFileSync("app/components/WebMcpBridge.tsx", "utf8");
for (const marker of ["document.modelContext", "registerTool", "getTools", "controller.abort()", "exposedTo: [location.origin]"]) {
  check(bridge.includes(marker), `Imperative bridge is missing ${marker}.`);
}

const headers = readFileSync("next.config.ts", "utf8");
check(headers.includes("tools=(self)"), "Permissions-Policy must restrict WebMCP tools to this origin.");
check(headers.includes("Cross-Origin-Opener-Policy"), "Cross-Origin-Opener-Policy header is required.");

const productSources = [declarative, bridge, readFileSync("lib/webmcp/tools.ts", "utf8")].join("\n");
check(!productSources.includes("navigator.modelContext"), "Deprecated navigator.modelContext must not be used.");

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    imperativeTools: allTools.length,
    publicImperativeTools: publicTools.length,
    declarativeTools: 1,
    names,
    journeyEvalCases: webMcpJourneyCases.length,
    selectionBaseline: `${selectionBaseline.summary.passed}/${selectionBaseline.summary.samples}`,
    forbiddenAbstention: `${forbiddenSamples.filter((sample) => sample.passed).length}/${forbiddenSamples.length}`,
    outputLimitCharacters: maxWebMcpOutputChars,
    findings: 0,
  }));
}
