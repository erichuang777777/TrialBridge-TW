/// <reference types="webmcp-types" />

import { readFileSync } from "node:fs";
import { buildTrialBridgeTools } from "../lib/webmcp/tools.ts";
import { capWebMcpOutput, maxWebMcpOutputChars } from "../lib/webmcp/output.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";
import { webMcpJourneyCases } from "../evals/webmcp-journeys.ts";
import { requiredCloudModel } from "../lib/llm/cloud.ts";
import { webMcpSelectionDatasetDigest, webMcpSelectionToolContractDigest } from "../lib/webmcp/selectionEval.ts";
import { appendCapabilitySet, appendToolExecution, createWebMcpSessionReceipt, maxWebMcpReceiptEvents } from "../lib/webmcp/receipt.ts";
import { bilingualCancerQueryLexicon, createRegistryQueryPlan } from "../lib/trials/queryBridge.ts";
import { webMcpCriticalJourney } from "../lib/webmcp/criticalJourney.ts";
import { createWebMcpDiagnosticReceipt } from "../lib/webmcp/diagnosticReceipt.ts";
import { cloudProbeTimeoutMs } from "../lib/llm/cloudProbe.ts";
import { webMcpImplementationLandscape } from "../lib/webmcp/implementationLandscape.ts";
import { webMcpCapabilityInventory } from "../lib/webmcp/capabilityInventory.ts";
import { webMcpConformanceMatrix, webMcpJudgeBundle } from "../lib/webmcp/judgeBundle.ts";

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
const shortlistTools = buildTrialBridgeTools({ profile, matches: [], sensitiveConsent: true, shortlistedTrialIds: ["synthetic:trial-001", "synthetic:trial-002"] });
const names = shortlistTools.map((tool) => tool.name);

function check(condition: boolean, message: string) {
  if (!condition) findings.push(message);
}

check(new Set(names).size === names.length, "Imperative tool names must be unique.");
check(publicTools.length === 2, "Exactly two public imperative tools must remain available without confirmed context.");
check(allTools.length === 6, "Exactly six imperative tools must be available after confirmed-context permission.");
check(shortlistTools.length === 7, "Exactly seven imperative tools must be available after two visible shortlist selections.");

for (const tool of shortlistTools) {
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

for (const toolName of ["search_public_cancer_trials", "review_trial_followups", "explain_confirmed_matches", "draft_trial_outreach", "draft_trial_discussion_brief", "compare_shortlisted_trials"]) {
  check(shortlistTools.find((tool) => tool.name === toolName)?.annotations?.untrustedContentHint === true, `${toolName}: registry-derived content must be marked untrusted.`);
}

const metadata = JSON.stringify(shortlistTools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))).toLocaleLowerCase("en");
check(!metadata.includes("rawnote") && !metadata.includes("maskednote"), "Raw or masked note fields must never enter an imperative tool contract.");
check(JSON.stringify(capWebMcpOutput("x".repeat(maxWebMcpOutputChars * 2))).length <= maxWebMcpOutputChars + 32, "Tool-output cap is not effective.");
const bilingualQueryPlan = createRegistryQueryPlan("胃癌");
check(bilingualCancerQueryLexicon.length === 19, "Bilingual registry query bridge must cover all 19 declared cancer groups.");
check(bilingualQueryPlan.registryConditions.TFDA === "胃癌" && bilingualQueryPlan.registryConditions["ClinicalTrials.gov"] === "gastric cancer", "Traditional Chinese public search must expose distinct Taiwan and overseas registry terms.");

let receiptEvents = appendCapabilitySet([], publicTools.map((tool) => tool.name), "2026-09-02T00:00:00.000Z", 1);
receiptEvents = appendCapabilitySet(receiptEvents, allTools.map((tool) => tool.name), "2026-09-02T00:00:01.000Z", 2);
receiptEvents = appendToolExecution(receiptEvents, "trialbridge_method", "completed", "2026-09-02T00:00:02.000Z", 3);
const sessionReceipt = createWebMcpSessionReceipt(receiptEvents, "2026-09-02T00:00:03.000Z", "https://trialbridge.example");
const serializedReceipt = JSON.stringify(sessionReceipt);
check(sessionReceipt.events.length <= maxWebMcpReceiptEvents, "WebMCP session receipt exceeds its event cap.");
check(sessionReceipt.events[1]?.kind === "capability_set" && sessionReceipt.events[1].addedToolNames.length === 4, "WebMCP receipt must expose confirmed-context capability additions.");
check(!/gastric cancer|fact_conformance|"(?:rawText|maskedText|medicalNote|profileFact|trialResult|prompt|argument|output)"\s*:/i.test(serializedReceipt), "WebMCP receipt contains health content or tool payload fields.");

check(webMcpCriticalJourney.steps.length === 5, "Critical user journey must expose five visible state transitions.");
check(webMcpCriticalJourney.steps[1]?.tools.length === 0, "Protected intake must intentionally expose no WebMCP tool.");
check(webMcpCriticalJourney.steps.every((step) => step.siteReaction.length > 0 && step.recovery.length > 0), "Every critical journey step must define a visible UI reaction and recovery path.");
const diagnosticReceipt = createWebMcpDiagnosticReceipt({
  generatedAt: "2026-09-02T00:00:00.000Z", origin: "https://trialbridge.example", browserState: "ready",
  expectedToolNames: publicTools.map((tool) => tool.name), discoveredToolNames: publicTools.map((tool) => tool.name),
  securityHeaders: { permissionsPolicy: true, openerPolicy: true, noSniff: true }, safeExecutionAvailable: true, safeSelfTestState: "passed",
  cloudProbe: { state: "ready", requestedModel: requiredCloudModel, reportedModel: "gpt-oss:120b", latencyMs: 600, checkedAt: "2026-09-02T00:00:00.000Z" },
});
check(diagnosticReceipt.containsHealthInformation === false && diagnosticReceipt.persistence === "download-only", "Browser diagnostic receipt must remain no-health-data and download-only.");
check(diagnosticReceipt.publicToolDiscovery.complete, "Browser diagnostic receipt must verify the complete public tool set.");
check(diagnosticReceipt.cloudProbe.containsHealthInformation === false && diagnosticReceipt.cloudProbe.storesModelContent === false, "Browser diagnostic receipt must not store cloud-probe content.");

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
  samples: Array<{ caseId: string; intent: string; requestedModel: string; passed: boolean; selectedTools: string[]; arguments: Array<{ toolName: string; values: Record<string, unknown> }> }>;
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
const shortlistSamples = selectionBaseline.samples.filter((sample) => sample.caseId === "shortlist-direct-en");
check(shortlistSamples.length === selectionBaseline.repetitions, "Selection baseline must include every shortlist repetition.");
check(shortlistSamples.every((sample) => sample.passed && sample.selectedTools.length === 1 && sample.selectedTools[0] === "compare_shortlisted_trials"), "Every recorded shortlist sample must select compare_shortlisted_trials.");
check(shortlistSamples.every((sample) => Object.keys(sample.arguments[0]?.values ?? {}).length === 1 && sample.arguments[0]?.values.language === "en"), "Shortlist selection samples must supply language only.");

const declarative = readFileSync("app/components/TrialDatabase.tsx", "utf8");
for (const marker of ["const declarativeToolName = \"search_public_trial_form\"", "toolname={declarativeToolName}", "tooldescription=", "toolautosubmit=", "toolparamdescription=", "agentInvoked", "respondWith(searchPromise)"]) {
  check(declarative.includes(marker), `Declarative search form is missing ${marker}.`);
}
check((declarative.match(/toolname=/g) ?? []).length === 1, "The public database must expose one visible declarative form tool.");
check(declarative.includes('addEventListener("toolcanceled"') && declarative.includes('addEventListener("toolcancel"'), "Declarative cancellation must cover the upstream draft and current Chromium event names.");

const compatibility = readFileSync("lib/webmcp/compatibility.ts", "utf8");
check(compatibility.includes("executeTool(tool, {})") && compatibility.includes("executeTool(tool, JSON.stringify({}))"), "Safe live execution must try the upstream object input before the current Chrome serialized-input fallback.");
check(compatibility.includes('tool.name !== "trialbridge_method"') && compatibility.includes("readOnlyHint !== true"), "Execution compatibility retries must remain restricted to the safe read-only method tool.");

const proofPage = readFileSync("app/webmcp/page.tsx", "utf8");
for (const marker of ["Standards alignment", "Declarative API", "Imperative API", "Lifecycle compatibility", "Origin security", "Compatibility profile audited", "Critical user journey", "webMcpCriticalJourney.steps", "user-journey guidance"]) {
  check(proofPage.includes(marker), `Competition evidence is missing the ${marker} standards marker.`);
}

const diagnosticSurface = readFileSync("app/webmcp/_components/WebMcpDiagnostics.tsx", "utf8");
for (const marker of ["createWebMcpDiagnosticReceipt", "Download this browser&apos;s diagnostic receipt", "Browser diagnostic receipt downloaded to this device"]) {
  check(diagnosticSurface.includes(marker), `Browser diagnostic surface is missing ${marker}.`);
}

const cloudProbeService = readFileSync("lib/llm/cloudProbe.ts", "utf8");
const cloudProbeRoute = readFileSync("app/api/cloud/probe/route.ts", "utf8");
const requestBodyGuard = readFileSync("lib/security/requestBody.ts", "utf8");
const cloudProbeVerifier = readFileSync("scripts/verify-cloud.ts", "utf8");
check(cloudProbeTimeoutMs === 30_000, "Cloud smoke test must keep its 30-second hard limit.");
for (const marker of ["fixed synthetic availability probe", 'think: "low"', "num_predict: 128", "containsHealthInformation: false", "storesModelContent: false"]) {
  check(cloudProbeService.includes(marker), `Cloud smoke test service is missing ${marker}.`);
}
for (const marker of ["hasDeclaredRequestBody(request)", 'bucket: "cloud-probe"', "limit: 3", "10 * 60_000", '"Cache-Control": "no-store"']) {
  check(cloudProbeRoute.includes(marker), `Cloud smoke test route is missing ${marker}.`);
}
for (const marker of ['request.headers.get("content-length")', 'request.headers.has("transfer-encoding")', 'request.headers.has("content-type")']) {
  check(requestBodyGuard.includes(marker), `Cloud smoke test body guard is missing ${marker}.`);
}
check(cloudProbeRoute.indexOf("if (hasDeclaredRequestBody(request))") < cloudProbeRoute.indexOf("const limit = consumeRateLimit"), "Cloud smoke test must reject request bodies before spending a provider-call allowance.");
for (const marker of ["Live cloud model smoke test", "It never reads the note, profile, results, or chat", 'role="status"', 'aria-atomic="true"', "Cancel probe", "Maximum 3 checks per 10 minutes"]) {
  check(diagnosticSurface.includes(marker), `Cloud smoke test UI is missing ${marker}.`);
}
check(cloudProbeVerifier.includes('method: "POST"') && !cloudProbeVerifier.includes("body:"), "Explicit cloud verifier must send a body-free POST.");

const bridge = readFileSync("app/components/WebMcpBridge.tsx", "utf8");
for (const marker of ["document.modelContext", "registerTool", "getTools", "controller.abort()", "exposedTo: [location.origin]", "createWebMcpSessionReceipt", "Download JSON receipt"]) {
  check(bridge.includes(marker), `Imperative bridge is missing ${marker}.`);
}

const headers = readFileSync("next.config.ts", "utf8");
check(headers.includes("tools=(self)"), "Permissions-Policy must restrict WebMCP tools to this origin.");
check(headers.includes("Cross-Origin-Opener-Policy"), "Cross-Origin-Opener-Policy header is required.");

const productSources = [declarative, bridge, readFileSync("lib/webmcp/tools.ts", "utf8")].join("\n");
check(!productSources.includes("navigator.modelContext"), "Deprecated navigator.modelContext must not be used.");
check(productSources.includes("queryPlan") && productSources.includes("registryConditions"), "Public WebMCP search must return bilingual registry query provenance.");

const registryReliability = [
  readFileSync("lib/trials/reliability.ts", "utf8"),
  readFileSync("lib/trials/search.ts", "utf8"),
  readFileSync("lib/trials/adapters/clinicalTrialsGov.ts", "utf8"),
  readFileSync("lib/webmcp/publicSearchOutput.ts", "utf8"),
  declarative,
].join("\n");
for (const marker of ["registrySourceTimeoutMs = 20_000", "AbortController", "SOURCE_TIMEOUT", "durationMs", 'completeness: failures.length > 0', "Partial registry results", "Each registry stops after"]) {
  check(registryReliability.includes(marker), `Registry reliability contract is missing ${marker}.`);
}

const cancellationChain = [
  readFileSync("lib/webmcp/tools.ts", "utf8"),
  readFileSync("app/api/trials/search/route.ts", "utf8"),
  readFileSync("app/api/matches/route.ts", "utf8"),
  readFileSync("lib/trials/search.ts", "utf8"),
  readFileSync("lib/trials/adapters/tfda.ts", "utf8"),
  readFileSync("lib/trials/adapters/clinicalTrialsGov.ts", "utf8"),
].join("\n");
for (const marker of ["options.signal", "request.signal", "AbortSignal.any", "throwIfAborted", "waitForPromiseWithSignal"]) {
  check(cancellationChain.includes(marker), `End-to-end WebMCP cancellation chain is missing ${marker}.`);
}
check(webMcpImplementationLandscape.auditedAt === "2026-09-02" && webMcpImplementationLandscape.upstreamCommit === "41d12f0", "Implementation landscape audit metadata is stale.");
check(webMcpImplementationLandscape.entries.some((entry) => entry.platform === "ChatGPT Desktop" && entry.status === "supported"), "Implementation landscape must include upstream-reported ChatGPT Desktop support.");
check(webMcpImplementationLandscape.evidenceBoundary.includes("not treat these entries as local runtime verification"), "Implementation landscape must preserve its source-reported evidence boundary.");
check(webMcpCapabilityInventory.length === 8 && webMcpCapabilityInventory.filter((tool) => tool.kind === "Declarative").length === 1, "Judge capability inventory must contain one declarative and seven imperative capabilities.");
check(webMcpCapabilityInventory.filter((tool) => tool.kind === "Imperative").map((tool) => tool.name).sort().join("|") === [...names].sort().join("|"), "Judge capability inventory must match the executable imperative tool set.");
check(webMcpConformanceMatrix.filter((item) => item.evidenceClass === "repository_verified").length === 7, "Judge matrix must expose seven repository-verified conformance items.");
check(webMcpConformanceMatrix.filter((item) => item.evidenceClass === "recorded_model_eval").length === 1, "Judge matrix must distinguish the recorded model evaluation.");
check(webMcpConformanceMatrix.filter((item) => item.evidenceClass === "manual_gate").length === 1, "Judge matrix must retain the manual Inspector gate.");
check(webMcpJudgeBundle.privacyBoundary.containsHealthInformation === false && webMcpJudgeBundle.privacyBoundary.readsMedicalWorkflowState === false, "Judge bundle must be static and contain no health information.");
check(webMcpJudgeBundle.recordedSelectionEval.datasetDigestSha256 === webMcpSelectionDatasetDigest() && webMcpJudgeBundle.recordedSelectionEval.toolContractDigestSha256 === webMcpSelectionToolContractDigest(), "Judge bundle must carry current selection-eval digests.");

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    imperativeTools: shortlistTools.length,
    confirmedContextTools: allTools.length,
    publicImperativeTools: publicTools.length,
    declarativeTools: 1,
    names,
    journeyEvalCases: webMcpJourneyCases.length,
    selectionBaseline: `${selectionBaseline.summary.passed}/${selectionBaseline.summary.samples}`,
    forbiddenAbstention: `${forbiddenSamples.filter((sample) => sample.passed).length}/${forbiddenSamples.length}`,
    shortlistSelection: `${shortlistSamples.filter((sample) => sample.passed).length}/${shortlistSamples.length}`,
    receiptLimitEvents: maxWebMcpReceiptEvents,
    criticalJourneySteps: webMcpCriticalJourney.steps.length,
    browserDiagnosticReceipt: "download-only-no-health-data",
    cloudProbeTimeoutMs,
    cloudProbeRateLimit: "3/10m",
    cloudProbeEvidence: "metadata-only-no-health-data",
    executionCompatibilityProfiles: 2,
    registrySourceDeadlineMs: 20_000,
    executionCancellation: "agent-to-registry",
    implementationLandscape: webMcpImplementationLandscape.entries.length,
    implementationLandscapeAudit: webMcpImplementationLandscape.auditedAt,
    judgeConformanceItems: webMcpConformanceMatrix.length,
    judgeBundle: "static-json-no-health-data",
    bilingualQueryGroups: bilingualCancerQueryLexicon.length,
    outputLimitCharacters: maxWebMcpOutputChars,
    findings: 0,
  }));
}
