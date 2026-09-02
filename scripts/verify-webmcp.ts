/// <reference types="webmcp-types" />

import { existsSync, readFileSync } from "node:fs";
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
import { fixedPublicExecutionContract } from "../lib/webmcp/fixedPublicExecution.ts";
import { createWebMcpInspectorAcceptanceReceipt, webMcpInspectorAcceptanceCases } from "../lib/webmcp/inspectorAcceptance.ts";
import { verifyWebMcpBrowserDiagnosticReceipt, verifyWebMcpInspectorAcceptanceReceipt } from "../lib/webmcp/receiptVerification.ts";
import { webMcpToolContractBundle, webMcpToolContractCatalog } from "../lib/webmcp/toolContractCatalog.ts";
import { publicTrialFormContractCore } from "../lib/webmcp/toolContractCore.ts";
import { webMcpCapabilityStateBundle, webMcpCapabilityStates } from "../lib/webmcp/capabilityStates.ts";
import { webMcpRuntimeAcceptanceChecks, webMcpRuntimeProbeName, type WebMcpRuntimeAcceptanceResult } from "../lib/webmcp/runtimeAcceptance.ts";
import { getWebMcpOriginTrialDeploymentState, getWebMcpOriginTrialMetaToken, webMcpOriginTrialEnvironmentKey } from "../lib/webmcp/originTrial.ts";
import { webMcpSpecCrosswalk, webMcpSpecCrosswalkBundle } from "../lib/webmcp/specCrosswalk.ts";
import { webMcpBrowserSetupContract, webMcpLocalTestingFlag } from "../lib/webmcp/browserSetup.ts";
import { liveAgentRehearsalContract, liveAgentRehearsalScenarios } from "../lib/webmcp/liveRehearsalContract.ts";
import { quickJudgeDemoContract } from "../lib/webmcp/quickJudgeDemo.ts";

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
const syntheticOriginTrialToken = "A".repeat(128);

function check(condition: boolean, message: string) {
  if (!condition) findings.push(message);
}

check(new Set(names).size === names.length, "Imperative tool names must be unique.");
check(publicTools.length === 2, "Exactly two public imperative tools must remain available without confirmed context.");
check(allTools.length === 6, "Exactly six imperative tools must be available after confirmed-context permission.");
check(shortlistTools.length === 7, "Exactly seven imperative tools must be available after two visible shortlist selections.");
check(webMcpCapabilityStates.length === 4, "Capability simulator must expose four synthetic human-controlled states.");
check(webMcpCapabilityStates.map((state) => state.activeImperativeToolNames.length).join("|") === "2|2|6|7", "Capability simulator must preserve the 2-2-6-7 registration sequence.");
check(webMcpCapabilityStateBundle.privacyBoundary.containsHealthInformation === false && webMcpCapabilityStateBundle.privacyBoundary.executesTools === false, "Capability simulator must remain static no-health-data evidence.");

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
  runtimeAcceptance: { state: "passed", result: {
    schemaVersion: "1.0", artifactClass: "live_browser_runtime_acceptance",
    startedAt: "2026-09-02T00:00:00.000Z", completedAt: "2026-09-02T00:00:01.000Z", state: "passed",
    probeToolName: webMcpRuntimeProbeName, toolchangeEvents: 2,
    checks: webMcpRuntimeAcceptanceChecks.map((item) => ({ ...item, status: "pass", detail: "Verified." })),
    persistence: "volatile-tab-only", containsHealthInformation: false, storesToolPayloads: false,
    evidenceBoundary: "Current-browser API metadata only. This does not prove Inspector behavior.",
  } satisfies WebMcpRuntimeAcceptanceResult },
  cloudProbe: { state: "ready", requestedModel: requiredCloudModel, reportedModel: "gpt-oss:120b", latencyMs: 600, checkedAt: "2026-09-02T00:00:00.000Z" },
});
check(diagnosticReceipt.containsHealthInformation === false && diagnosticReceipt.persistence === "download-only", "Browser diagnostic receipt must remain no-health-data and download-only.");
check(diagnosticReceipt.publicToolDiscovery.complete, "Browser diagnostic receipt must verify the complete public tool set.");
check(diagnosticReceipt.lifecycleAcceptance.state === "passed" && diagnosticReceipt.lifecycleAcceptance.checks.every((item) => item.status === "pass"), "Browser diagnostic receipt must include all passing lifecycle checks.");
check(verifyWebMcpBrowserDiagnosticReceipt(diagnosticReceipt).ok, "Complete browser diagnostic receipt must pass the offline structural verifier.");
check(diagnosticReceipt.cloudProbe.containsHealthInformation === false && diagnosticReceipt.cloudProbe.storesModelContent === false, "Browser diagnostic receipt must not store cloud-probe content.");

const recordedBrowserRuntimeSource = readFileSync("evals/webmcp-browser-runtime-acceptance.json", "utf8");
const recordedBrowserRuntime = JSON.parse(recordedBrowserRuntimeSource) as {
  artifactClass: string;
  recordedAt: string;
  browser: { product: string; channel: string; version: string; headless: boolean; localTestingFeatures: string[] };
  target: { origin: string; route: string; secureContext: boolean };
  result: { consoleErrors: number; postRunToolNames: string[]; probePresentAfter: boolean; receipt: unknown };
  evidenceBoundary: string;
};
const recordedBrowserVerification = verifyWebMcpBrowserDiagnosticReceipt(recordedBrowserRuntime.result.receipt);
check(recordedBrowserRuntime.artifactClass === "recorded_live_browser_runtime_acceptance", "Recorded browser artifact class is invalid.");
check(recordedBrowserRuntime.browser.product === "Chrome for Testing" && recordedBrowserRuntime.browser.channel === "Beta" && /^153\./.test(recordedBrowserRuntime.browser.version), "Recorded browser runtime must identify the tested Chrome 153 Beta build.");
check(recordedBrowserRuntime.browser.headless === true && ["WebMCP", "WebMCPTesting"].every((feature) => recordedBrowserRuntime.browser.localTestingFeatures.includes(feature)), "Recorded browser runtime must identify its isolated local-testing profile.");
check(recordedBrowserRuntime.target.origin === "http://localhost:3001" && recordedBrowserRuntime.target.route === "/webmcp" && recordedBrowserRuntime.target.secureContext === true, "Recorded browser runtime target is invalid.");
check(recordedBrowserVerification.ok && recordedBrowserVerification.metadataOnly, `Recorded browser receipt failed verification: ${recordedBrowserVerification.errors.join("; ")}`);
check(recordedBrowserRuntime.result.consoleErrors === 0, "Recorded browser runtime must have zero console errors.");
check(recordedBrowserRuntime.result.probePresentAfter === false, "Recorded browser runtime probe must be absent after cleanup.");
check(recordedBrowserRuntime.result.postRunToolNames.slice().sort().join("|") === publicTools.map((tool) => tool.name).sort().join("|"), "Recorded browser runtime must end with only the public imperative tools.");
check(typeof recordedBrowserRuntime.evidenceBoundary === "string" && /not an Origin Trial production deployment/i.test(recordedBrowserRuntime.evidenceBoundary), "Recorded browser runtime evidence boundary is missing.");
check(!/"(?:rawText|maskedText|medicalNote|confirmedProfile|profileFact|trialResult|prompt|toolArgument|toolOutput|content|thinking)"\s*:/i.test(recordedBrowserRuntimeSource), "Recorded browser runtime contains a forbidden payload field.");

const inspectorOutcomes = Object.fromEntries(webMcpInspectorAcceptanceCases.map((item) => [item.id, "pass"])) as Record<(typeof webMcpInspectorAcceptanceCases)[number]["id"], "pass">;
const inspectorReceipt = createWebMcpInspectorAcceptanceReceipt({ generatedAt: "2026-09-02T00:00:00.000Z", origin: "https://trialbridge.example", chromeMajor: 152, outcomes: inspectorOutcomes });
check(webMcpInspectorAcceptanceCases.length === 6, "Manual Inspector kit must keep its six acceptance cases.");
check(inspectorReceipt.selfAttested === true && inspectorReceipt.cryptographicallyVerified === false, "Manual Inspector receipt must not claim automatic or cryptographic verification.");
check(inspectorReceipt.containsHealthInformation === false && inspectorReceipt.storesPromptContent === false, "Manual Inspector receipt must exclude health information and prompts.");
check(verifyWebMcpInspectorAcceptanceReceipt(inspectorReceipt).ok, "Complete manual Inspector receipt must pass the offline structural verifier.");

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
for (const marker of ["const declarativeToolName = publicTrialFormContractCore.name", "toolname={declarativeToolName}", "publicTrialFormContractCore.description", "toolautosubmit=", "toolparamdescription=", "agentInvoked", "respondWith(searchPromise)"]) {
  check(declarative.includes(marker), `Declarative search form is missing ${marker}.`);
}
check((declarative.match(/toolname=/g) ?? []).length === 1, "The public database must expose one visible declarative form tool.");
check(declarative.includes('addEventListener("toolcanceled"') && declarative.includes('addEventListener("toolcancel"'), "Declarative cancellation must cover the upstream draft and current Chromium event names.");

const compatibility = readFileSync("lib/webmcp/compatibility.ts", "utf8");
check(compatibility.includes("executeTool(tool, {}, { signal })") && compatibility.includes("executeTool(tool, JSON.stringify({}), { signal })"), "Safe live execution must try the upstream object input before the current Chrome serialized-input fallback.");
check(compatibility.includes('tool.name !== "trialbridge_method"') && compatibility.includes("readOnlyHint !== true"), "Execution compatibility retries must remain restricted to the safe read-only method tool.");
check(compatibility.includes("if (signal?.aborted)"), "Safe live execution must not retry after cancellation.");

const quickJudgePage = readFileSync("app/webmcp/quickstart/page.tsx", "utf8");
const quickJudgeSurface = readFileSync("app/webmcp/quickstart/_components/QuickJudgeConsole.tsx", "utf8");
for (const marker of ["Three-minute judge demo", "QuickJudgeConsole", "No patient data required", "/trials?condition=", "/match?demo=synthetic", "/webmcp/evidence.json"]) {
  check(quickJudgePage.includes(marker), `Three-minute judge route is missing ${marker}.`);
}
for (const marker of ["buildTrialBridgeTools", "exposedTo: [location.origin]", "getTools({ fromOrigins: [location.origin] })", "executeSafeMethodToolCompat", "quickJudgeDemoContract.executionTimeoutMs", 'role="status" aria-atomic="true"']) {
  check(quickJudgeSurface.includes(marker), `Three-minute judge console is missing ${marker}.`);
}
check(quickJudgeDemoContract.route === "/webmcp/quickstart" && quickJudgeDemoContract.targetMinutes === 3, "Three-minute judge route contract is invalid.");
check(quickJudgeDemoContract.publicToolNames.join("|") === "trialbridge_method|search_public_cancer_trials", "Three-minute judge route must expose exactly the two public tools.");
check(quickJudgeDemoContract.safeExecutionTool === "trialbridge_method" && quickJudgeDemoContract.behavior.acceptsFreeText === false && quickJudgeDemoContract.behavior.runsCloudModel === false && quickJudgeDemoContract.behavior.runsRegistrySearch === false, "Three-minute judge execution must remain fixed, no-input, no-model, and no-registry.");
check(quickJudgeDemoContract.privacyBoundary.containsHealthInformation === false && quickJudgeDemoContract.privacyBoundary.readsPatientContext === false, "Three-minute judge route must remain no-PHI and independent of patient context.");
check(!/<(?:input|textarea)\b/i.test(quickJudgeSurface), "Three-minute judge console must not accept free text.");

const runtimeAcceptanceSource = readFileSync("lib/webmcp/runtimeAcceptance.ts", "utf8");
check(webMcpRuntimeAcceptanceChecks.length === 6, "Live runtime acceptance must keep six lifecycle checks.");
for (const marker of ["registerTool", "getTools", "executeTool", 'addEventListener("toolchange"', "registrationController.abort()", "probe_cleanup"]) {
  check(runtimeAcceptanceSource.includes(marker), `Live runtime acceptance is missing ${marker}.`);
}
check(!/fetch\(|rawText|maskedText|ConfirmedProfile|TrialMatch/.test(runtimeAcceptanceSource), "Live runtime acceptance must remain no-network and independent of medical workflow state.");
check(runtimeAcceptanceSource.indexOf("JSON.stringify(input)") < runtimeAcceptanceSource.indexOf("executeTool(tool, input"), "Runtime acceptance must try the current Chrome serialized input before the draft object fallback.");

const proofPage = readFileSync("app/webmcp/page.tsx", "utf8");
for (const marker of ["Standards alignment", "Declarative API", "Imperative API", "Lifecycle compatibility", "Origin security", "Compatibility profile audited", "Upstream specification crosswalk", "Honest draft boundary", "Critical user journey", "webMcpCriticalJourney.steps", "user-journey guidance"]) {
  check(proofPage.includes(marker), `Competition evidence is missing the ${marker} standards marker.`);
}

const browserSetupSurface = readFileSync("app/webmcp/_components/WebMcpBrowserSetup.tsx", "utf8");
for (const marker of ["WebMCP itself has nothing to install", "No extension required", "Complete only the Chrome step for local testing", "Inspector is separate and optional", 'role="status" aria-atomic="true"']) {
  check(browserSetupSurface.includes(marker), `Browser setup surface is missing ${marker}.`);
}
check(webMcpLocalTestingFlag === "chrome://flags/#enable-webmcp-testing", "Canonical local-testing flag address changed unexpectedly.");
check(webMcpBrowserSetupContract.visitorInstallRequired === false && webMcpBrowserSetupContract.inspector.separateFromWebMcp === true && webMcpBrowserSetupContract.inspector.optionalForVisitors === true, "Browser setup must keep native WebMCP separate from the optional Inspector.");
check(webMcpBrowserSetupContract.layers.map((layer) => layer.id).join("|") === "specification|browser|trialbridge", "Browser setup must preserve the three-layer explanation.");
check(webMcpBrowserSetupContract.privacyBoundary.containsHealthInformation === false && webMcpBrowserSetupContract.privacyBoundary.readsBrowserState === false && webMcpBrowserSetupContract.privacyBoundary.executesTools === false, "Browser setup guidance must remain static and no-health-data.");

const liveRehearsalSurface = readFileSync("app/webmcp/_components/LiveAgentRehearsal.tsx", "utf8");
for (const marker of ["Live agent rehearsal", "Watch the model choose a WebMCP capability", "No free text or patient data", "No execution", "does not execute WebMCP", "Execute the selected public capability in this browser", "site-orchestrated, fixed-input browser execution", 'role="status" aria-atomic="true"']) {
  check(liveRehearsalSurface.includes(marker), `Live agent rehearsal is missing ${marker}.`);
}
check(liveAgentRehearsalScenarios.length === 4 && liveAgentRehearsalScenarios.some((scenario) => scenario.intent === "forbidden" && scenario.expectedTools.length === 0), "Live rehearsal must include four fixed scenarios and one safe-abstention case.");
check(liveAgentRehearsalContract.behavior.acceptsFreeText === false && liveAgentRehearsalContract.behavior.executesSelectedTool === false && liveAgentRehearsalContract.behavior.persistsResult === false, "Live rehearsal must remain fixed-input, no-execution, and volatile.");
check(liveAgentRehearsalContract.privacyBoundary.containsHealthInformation === false && liveAgentRehearsalContract.privacyBoundary.sendsPatientContent === false && liveAgentRehearsalContract.privacyBoundary.storesModelContentOrThinking === false, "Live rehearsal must remain no-PHI and metadata-only.");
check(fixedPublicExecutionContract.toolName === "search_public_cancer_trials" && fixedPublicExecutionContract.condition === "胃癌", "Fixed browser execution must remain restricted to the public gastric-cancer search.");
check(fixedPublicExecutionContract.behavior.acceptsFreeText === false && fixedPublicExecutionContract.behavior.changesWorkflowState === false && fixedPublicExecutionContract.behavior.persistsResult === false, "Fixed browser execution must remain fixed-input, volatile, and non-mutating.");
check(fixedPublicExecutionContract.privacyBoundary.containsHealthInformation === false && fixedPublicExecutionContract.privacyBoundary.readsPatientContext === false, "Fixed browser execution must remain no-PHI and independent of patient context.");

const diagnosticSurface = readFileSync("app/webmcp/_components/WebMcpDiagnostics.tsx", "utf8");
for (const marker of ["createWebMcpDiagnosticReceipt", "Download this browser&apos;s diagnostic receipt", "Browser diagnostic receipt downloaded to this device"]) {
  check(diagnosticSurface.includes(marker), `Browser diagnostic surface is missing ${marker}.`);
}

const inspectorSurface = readFileSync("app/webmcp/_components/InspectorAcceptanceKit.tsx", "utf8");
for (const marker of ["Manual Chrome gate", "Copy prompt", "Needs attention", "Download manual JSON", "self-attested—not automatic proof"]) {
  check(inspectorSurface.includes(marker), `Inspector acceptance surface is missing ${marker}.`);
}

const contractSurface = readFileSync("app/webmcp/_components/ToolContractExplorer.tsx", "utf8");
const contractRoute = readFileSync("app/webmcp/contracts.json/route.ts", "utf8");
for (const marker of ["Canonical tool contracts", "Copy JSON Schema", "Download contracts JSON", 'role="status" aria-atomic="true"']) {
  check(contractSurface.includes(marker), `Tool contract explorer is missing ${marker}.`);
}
check(contractRoute.includes('dynamic = "force-static"') && contractRoute.includes("webMcpToolContractBundle"), "Tool contract artifact must remain static and canonical.");
check(webMcpToolContractCatalog.length === 8 && webMcpToolContractBundle.summary.withinChromeGuidance === 8, "All eight tool contracts must remain inside Chrome character guidance.");
check(webMcpToolContractBundle.summary.writeAuthority === 0 && webMcpToolContractBundle.summary.readOnlyBehavior === 8, "Tool catalog must expose eight read-only behaviors and zero write authority.");
check(webMcpToolContractBundle.privacyBoundary.containsHealthInformation === false && webMcpToolContractBundle.privacyBoundary.readsMedicalWorkflowState === false, "Tool contract artifact must remain static and no-health-data.");
check(webMcpToolContractCatalog[0]?.name === publicTrialFormContractCore.name, "Declarative form contract must lead the canonical catalog.");

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

const localOriginTrial = getWebMcpOriginTrialDeploymentState({});
const configuredOriginTrialEnvironment = { SITE_URL: "https://trialbridge.example", [webMcpOriginTrialEnvironmentKey]: syntheticOriginTrialToken };
const configuredOriginTrial = getWebMcpOriginTrialDeploymentState(configuredOriginTrialEnvironment);
const invalidOriginTrial = getWebMcpOriginTrialDeploymentState({ SITE_URL: "http://localhost:3001", [webMcpOriginTrialEnvironmentKey]: syntheticOriginTrialToken });
check(localOriginTrial.status === "local_testing_only" && localOriginTrial.tokenConfigured === false, "Default Origin Trial state must remain local-testing only.");
check(configuredOriginTrial.status === "configured_unverified" && configuredOriginTrial.originEligible === true && configuredOriginTrial.browserValidation === "required", "Production-shaped Origin Trial state must remain configured but externally unverified.");
check(configuredOriginTrial.containsToken === false && !JSON.stringify(configuredOriginTrial).includes(syntheticOriginTrialToken), "Origin Trial readiness metadata must never expose the token.");
check(getWebMcpOriginTrialMetaToken(configuredOriginTrialEnvironment) === syntheticOriginTrialToken, "A valid exact-origin token must be available only to server-rendered meta delivery.");
check(invalidOriginTrial.status === "misconfigured", "Origin Trial deployment must fail closed for a loopback or non-HTTPS SITE_URL.");
const layoutSource = readFileSync("app/layout.tsx", "utf8");
const healthSource = readFileSync("app/api/health/route.ts", "utf8");
check(layoutSource.includes("getWebMcpOriginTrialMetaToken") && layoutSource.includes('httpEquiv="origin-trial"'), "Root layout must emit the validated first-party token before WebMCP access.");
check(healthSource.includes("getWebMcpOriginTrialDeploymentState") && healthSource.includes("containsToken"), "Health must expose bounded Origin Trial readiness without the token.");
check(!`${layoutSource}\n${healthSource}`.includes("NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN"), "Origin Trial configuration must stay out of client JavaScript environment variables.");

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
check(webMcpSpecCrosswalk.length === 8 && webMcpSpecCrosswalkBundle.summary.implemented === 7 && webMcpSpecCrosswalkBundle.summary.explainerAligned === 1, "Specification crosswalk must preserve seven implemented and one explainer-aligned clause.");
check(webMcpSpecCrosswalkBundle.upstreamCommit.startsWith(webMcpImplementationLandscape.upstreamCommit), "Specification crosswalk and implementation landscape must reference the same upstream commit.");
check(webMcpSpecCrosswalk.find((item) => item.id === "S-08")?.standardState.includes("explicitly TODO") === true && webMcpSpecCrosswalkBundle.summary.claimedNormativeDeclarativeConformance === false, "Declarative evidence must not claim normative conformance while the upstream section is TODO.");
check(webMcpSpecCrosswalk.every((item) => item.specUrl.startsWith("https://webmachinelearning.github.io/webmcp/#") && item.evidence.length > 0), "Every specification crosswalk row needs an exact upstream anchor and repository evidence.");
check(webMcpCapabilityInventory.length === 8 && webMcpCapabilityInventory.filter((tool) => tool.kind === "Declarative").length === 1, "Judge capability inventory must contain one declarative and seven imperative capabilities.");
check(webMcpCapabilityInventory.filter((tool) => tool.kind === "Imperative").map((tool) => tool.name).sort().join("|") === [...names].sort().join("|"), "Judge capability inventory must match the executable imperative tool set.");
check(webMcpConformanceMatrix.filter((item) => item.evidenceClass === "repository_verified").length === 7, "Judge matrix must expose seven repository-verified conformance items.");
check(webMcpConformanceMatrix.filter((item) => item.evidenceClass === "recorded_model_eval").length === 1, "Judge matrix must distinguish the recorded model evaluation.");
check(webMcpConformanceMatrix.filter((item) => item.evidenceClass === "manual_gate").length === 1, "Judge matrix must retain the manual Inspector gate.");
for (const item of webMcpConformanceMatrix) {
  for (const evidence of item.evidence.filter((entry) => !entry.startsWith("https://"))) check(existsSync(evidence), `${item.id}: evidence path does not exist: ${evidence}`);
}
for (const item of webMcpSpecCrosswalk) {
  for (const evidence of item.evidence) check(existsSync(evidence), `${item.id}: evidence path does not exist: ${evidence}`);
}
check(webMcpJudgeBundle.summary.manualInspectorCases === 6, "Judge bundle must report the six manual Inspector cases.");
check(webMcpJudgeBundle.summary.webMcpVisitorInstallRequired === false && webMcpJudgeBundle.browserSetup.inspector.separateFromWebMcp === true, "Judge bundle must state that WebMCP requires no visitor extension and Inspector is separate.");
check(webMcpJudgeBundle.summary.liveAgentRehearsalScenarios === 4 && webMcpJudgeBundle.liveAgentRehearsal.behavior.executesSelectedTool === false, "Judge bundle must carry the four-scenario no-execution live rehearsal contract.");
check(webMcpJudgeBundle.summary.fixedPublicBrowserExecution === true && webMcpJudgeBundle.fixedPublicBrowserExecution.toolName === "search_public_cancer_trials", "Judge bundle must carry the separate fixed public browser-execution contract.");
check(webMcpJudgeBundle.summary.quickJudgeRoute === quickJudgeDemoContract.route && webMcpJudgeBundle.quickJudgeDemo.targetMinutes === 3, "Judge bundle must carry the three-minute route contract.");
check(webMcpJudgeBundle.summary.toolContracts === 8 && webMcpJudgeBundle.toolContractCatalog.withinChromeGuidance === 8, "Judge bundle must link all budget-compliant tool contracts.");
check(webMcpJudgeBundle.summary.capabilityStates === 4 && webMcpJudgeBundle.capabilityStateModel.states.length === 4, "Judge bundle must carry the four-state capability model.");
check(webMcpJudgeBundle.summary.runtimeAcceptanceChecks === 6 && webMcpJudgeBundle.runtimeAcceptanceProfile.checks.length === 6, "Judge bundle must carry the six-check runtime suite definition.");
check(webMcpJudgeBundle.runtimeAcceptanceProfile.privacyBoundary.containsHealthInformation === false && webMcpJudgeBundle.runtimeAcceptanceProfile.privacyBoundary.networkRequests === false, "Judge runtime suite profile must remain no-PHI and no-network.");
check(webMcpJudgeBundle.summary.recordedBrowserRuntimeChecksPassed === 6 && webMcpJudgeBundle.recordedBrowserRuntime.checksPassed === 6 && webMcpJudgeBundle.recordedBrowserRuntime.checksTotal === 6, "Judge bundle must carry the recorded six-of-six browser runtime result.");
check(webMcpJudgeBundle.recordedBrowserRuntime.consoleErrors === 0 && webMcpJudgeBundle.recordedBrowserRuntime.probePresentAfter === false && webMcpJudgeBundle.recordedBrowserRuntime.containsHealthInformation === false, "Judge bundle recorded browser result must remain clean and no-PHI.");
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
    runtimeAcceptanceChecks: webMcpRuntimeAcceptanceChecks.length,
    recordedBrowserRuntime: `${webMcpJudgeBundle.recordedBrowserRuntime.checksPassed}/${webMcpJudgeBundle.recordedBrowserRuntime.checksTotal} Chrome ${recordedBrowserRuntime.browser.version}`,
    originTrialDeploymentContract: "local|configured-unverified|fail-closed-no-token-json",
    cloudProbeTimeoutMs,
    cloudProbeRateLimit: "3/10m",
    cloudProbeEvidence: "metadata-only-no-health-data",
    executionCompatibilityProfiles: 2,
    registrySourceDeadlineMs: 20_000,
    executionCancellation: "agent-to-registry",
    implementationLandscape: webMcpImplementationLandscape.entries.length,
    implementationLandscapeAudit: webMcpImplementationLandscape.auditedAt,
    specificationCrosswalk: `${webMcpSpecCrosswalkBundle.summary.implemented}+${webMcpSpecCrosswalkBundle.summary.explainerAligned}/${webMcpSpecCrosswalkBundle.summary.clauses}`,
    webMcpVisitorInstallRequired: webMcpBrowserSetupContract.visitorInstallRequired,
    liveAgentRehearsalScenarios: liveAgentRehearsalScenarios.length,
    fixedPublicBrowserExecution: `${fixedPublicExecutionContract.toolName}:${fixedPublicExecutionContract.condition}`,
    quickJudgeRoute: quickJudgeDemoContract.route,
    judgeConformanceItems: webMcpConformanceMatrix.length,
    judgeBundle: "static-json-no-health-data",
    manualInspectorCases: webMcpInspectorAcceptanceCases.length,
    manualInspectorReceipt: "self-attested-no-health-data",
    toolContractCatalog: `${webMcpToolContractBundle.summary.withinChromeGuidance}/${webMcpToolContractBundle.summary.tools}-within-guidance`,
    capabilityStateSequence: webMcpCapabilityStates.map((state) => state.activeImperativeToolNames.length).join("-"),
    bilingualQueryGroups: bilingualCancerQueryLexicon.length,
    outputLimitCharacters: maxWebMcpOutputChars,
    findings: 0,
  }));
}
