import selectionBaseline from "../../evals/webmcp-selection-baseline.json" with { type: "json" };
import recordedBrowserRuntime from "../../evals/webmcp-browser-runtime-acceptance.json" with { type: "json" };
import recordedAgenticLighthouse from "../../evals/webmcp-lighthouse-agentic-acceptance.json" with { type: "json" };
import recordedInspectorExtensionRuntime from "../../evals/webmcp-inspector-extension-runtime.json" with { type: "json" };
import { webMcpCapabilityInventory } from "./capabilityInventory.ts";
import { webMcpCriticalJourney } from "./criticalJourney.ts";
import { webMcpImplementationLandscape } from "./implementationLandscape.ts";
import { webMcpInspectorAcceptanceCases } from "./inspectorAcceptance.ts";
import { webMcpToolContractBundle } from "./toolContractCatalog.ts";
import { webMcpCapabilityStateBundle } from "./capabilityStates.ts";
import { webMcpRuntimeAcceptanceChecks, webMcpRuntimeProbeName } from "./runtimeAcceptance.ts";
import { webMcpSpecCrosswalkBundle } from "./specCrosswalk.ts";
import { webMcpBrowserSetupContract } from "./browserSetup.ts";
import { liveAgentRehearsalContract } from "./liveRehearsalContract.ts";
import { fixedPublicExecutionContract } from "./fixedPublicExecution.ts";
import { quickJudgeDemoContract } from "./quickJudgeDemo.ts";
import { agentDiscoveryContract } from "./agentDiscovery.ts";

export type WebMcpEvidenceClass = "repository_verified" | "recorded_browser_runtime" | "recorded_model_eval" | "manual_gate";

export const webMcpConformanceMatrix = [
  {
    id: "C-01",
    evidenceClass: "repository_verified",
    evidenceLabel: "Repository verified",
    requirement: "Visible declarative tool",
    implementation: "The public trial form is the tool and returns through the same visible submit path.",
    evidence: ["app/components/TrialDatabase.tsx", "tests/readiness.test.ts"],
  },
  {
    id: "C-02",
    evidenceClass: "repository_verified",
    evidenceLabel: "Repository verified",
    requirement: "Typed imperative discovery",
    implementation: "Seven schema-bounded tools use registerTool(), getTools(), and executeTool() without write authority.",
    evidence: ["lib/webmcp/tools.ts", "lib/webmcp/runtimeAcceptance.ts", "evals/webmcp-browser-runtime-acceptance.json", "scripts/verify-webmcp.ts"],
  },
  {
    id: "C-03",
    evidenceClass: "repository_verified",
    evidenceLabel: "Repository verified",
    requirement: "State-scoped capabilities",
    implementation: "Consent, confirmed context, pending questions, and the visible shortlist determine which tools exist.",
    evidence: ["lib/webmcp/capabilityStates.ts", "app/components/WebMcpBridge.tsx", "tests/webmcp-capability-states.test.ts"],
  },
  {
    id: "C-04",
    evidenceClass: "repository_verified",
    evidenceLabel: "Repository verified",
    requirement: "Origin and permission boundary",
    implementation: "tools=(self), same-origin exposedTo, read-only hints, and untrusted-content hints constrain discovery and trust.",
    evidence: ["next.config.ts", "app/components/WebMcpBridge.tsx", "scripts/verify-webmcp.ts"],
  },
  {
    id: "C-05",
    evidenceClass: "repository_verified",
    evidenceLabel: "Repository verified",
    requirement: "Bounded untrusted output",
    implementation: "Registry text is source-linked, marked untrusted, and capped before it returns to an agent.",
    evidence: ["lib/webmcp/output.ts", "lib/webmcp/publicSearchOutput.ts", "tests/webmcp.test.ts"],
  },
  {
    id: "C-06",
    evidenceClass: "repository_verified",
    evidenceLabel: "Repository verified",
    requirement: "Execution lifecycle and cancellation",
    implementation: "The execution signal reaches browser fetch, Next.js, matching, and every registry adapter with payload-free status.",
    evidence: ["lib/webmcp/runtimeAcceptance.ts", "lib/webmcp/tools.ts", "lib/trials/search.ts", "evals/webmcp-browser-runtime-acceptance.json", "tests/webmcp-runtime-acceptance.test.ts"],
  },
  {
    id: "C-07",
    evidenceClass: "repository_verified",
    evidenceLabel: "Repository verified",
    requirement: "Progressive enhancement",
    implementation: "The human workflow remains complete when document.modelContext is unavailable.",
    evidence: ["app/components/WebMcpBridge.tsx", "app/components/TrialDatabase.tsx"],
  },
  {
    id: "C-08",
    evidenceClass: "recorded_model_eval",
    evidenceLabel: "Recorded model eval",
    requirement: "Tool selection and safe abstention",
    implementation: `${selectionBaseline.summary.passed}/${selectionBaseline.summary.samples} synthetic single-turn samples passed, including forbidden requests.`,
    evidence: ["evals/webmcp-selection-baseline.json", "docs/WEBMCP_SELECTION_EVAL.md"],
  },
  {
    id: "C-09",
    evidenceClass: "recorded_browser_runtime",
    evidenceLabel: "Recorded Inspector runtime",
    requirement: "Stock Inspector discovery, safe execution, and permission lifecycle",
    implementation: `${recordedInspectorExtensionRuntime.result.checksPassed}/${recordedInspectorExtensionRuntime.result.checksTotal} stock-extension checks passed: public discovery/schema parsing, fixed read-only method execution, and fictional 2→2→6→2 permission revocation.`,
    evidence: ["evals/webmcp-inspector-extension-runtime.json", "https://github.com/beaufortfrancois/model-context-tool-inspector"],
  },
  {
    id: "C-10",
    evidenceClass: "manual_gate",
    evidenceLabel: "Manual Inspector gate",
    requirement: "Natural-language and cancellation completion",
    implementation: "Three checks remain not run: the two stock natural-language checks require Gemini, and stock Inspector 1.9.14 has no agent cancel control or executeTool AbortSignal. TrialBridge separately provides visible human cancellation; judges must still verify agent cancellation/cleanup, and production Origin Trial behavior remains an external gate.",
    evidence: ["app/webmcp/_components/InspectorAcceptanceKit.tsx", "https://developer.chrome.com/docs/ai/webmcp", "docs/WEBMCP_VERIFICATION.md"],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  evidenceClass: WebMcpEvidenceClass;
  evidenceLabel: string;
  requirement: string;
  implementation: string;
  evidence: readonly string[];
}>;

const evidenceCounts = {
  repositoryVerified: webMcpConformanceMatrix.filter((item) => item.evidenceClass === "repository_verified").length,
  recordedBrowserRuntime: webMcpConformanceMatrix.filter((item) => item.evidenceClass === "recorded_browser_runtime").length,
  recordedModelEval: webMcpConformanceMatrix.filter((item) => item.evidenceClass === "recorded_model_eval").length,
  manualGate: webMcpConformanceMatrix.filter((item) => item.evidenceClass === "manual_gate").length,
};

export const webMcpJudgeBundle = {
  schemaVersion: "1.0",
  auditedAt: webMcpImplementationLandscape.auditedAt,
  artifactClass: "competition_evidence_not_protocol_metadata",
  standardProfile: {
    upstreamDraft: "https://webmachinelearning.github.io/webmcp/",
    upstreamCommit: webMcpImplementationLandscape.upstreamCommit,
    chromeGuide: "https://developer.chrome.com/docs/ai/webmcp",
    webMcpTypes: "0.1.5",
  },
  privacyBoundary: {
    containsHealthInformation: false,
    readsCurrentBrowserSession: false,
    readsMedicalWorkflowState: false,
    persistence: "static public JSON",
  },
  summary: {
    declarativeTools: webMcpCapabilityInventory.filter((tool) => tool.kind === "Declarative").length,
    imperativeTools: webMcpCapabilityInventory.filter((tool) => tool.kind === "Imperative").length,
    writeOrEnrollmentTools: 0,
    criticalJourneySteps: webMcpCriticalJourney.steps.length,
    conformanceItems: webMcpConformanceMatrix.length,
    specificationClauses: webMcpSpecCrosswalkBundle.summary.clauses,
    webMcpVisitorInstallRequired: webMcpBrowserSetupContract.visitorInstallRequired,
    liveAgentRehearsalScenarios: liveAgentRehearsalContract.fixedScenarioIds.length,
    fixedPublicBrowserExecution: fixedPublicExecutionContract.behavior.executesOnlyFixedPublicSearch,
    quickJudgeRoute: quickJudgeDemoContract.route,
    agentDiscoveryRoute: agentDiscoveryContract.routes.agentGuide,
    manualInspectorCases: webMcpInspectorAcceptanceCases.length,
    toolContracts: webMcpToolContractBundle.summary.tools,
    capabilityStates: webMcpCapabilityStateBundle.states.length,
    runtimeAcceptanceChecks: webMcpRuntimeAcceptanceChecks.length,
    recordedBrowserRuntimeChecksPassed: recordedBrowserRuntime.result.receipt.lifecycleAcceptance.checks.filter((item) => item.status === "pass").length,
    recordedInspectorExtensionChecksPassed: recordedInspectorExtensionRuntime.result.checksPassed,
    recordedInspectorExtensionChecksTotal: recordedInspectorExtensionRuntime.result.checksTotal,
    recordedAgenticPagesPassed: recordedAgenticLighthouse.pages.filter((page) => page.categoryScore === 1).length,
    ...evidenceCounts,
  },
  capabilities: webMcpCapabilityInventory,
  specificationCrosswalk: webMcpSpecCrosswalkBundle,
  browserSetup: webMcpBrowserSetupContract,
  liveAgentRehearsal: liveAgentRehearsalContract,
  fixedPublicBrowserExecution: fixedPublicExecutionContract,
  quickJudgeDemo: quickJudgeDemoContract,
  agentDiscovery: agentDiscoveryContract,
  toolContractCatalog: {
    route: "/webmcp/contracts.json",
    contractVersion: webMcpToolContractBundle.contractVersion,
    tools: webMcpToolContractBundle.summary.tools,
    withinChromeGuidance: webMcpToolContractBundle.summary.withinChromeGuidance,
    containsHealthInformation: webMcpToolContractBundle.privacyBoundary.containsHealthInformation,
  },
  capabilityStateModel: webMcpCapabilityStateBundle,
  runtimeAcceptanceProfile: {
    artifactClass: "browser_runtime_suite_definition_not_runtime_result",
    probeToolName: webMcpRuntimeProbeName,
    checks: webMcpRuntimeAcceptanceChecks,
    privacyBoundary: { containsHealthInformation: false, storesToolPayloads: false, networkRequests: false },
    evidenceBoundary: "Static suite definition only. A downloaded current-browser receipt is required to claim a live pass, and Inspector remains separate.",
  },
  recordedBrowserRuntime: {
    artifactClass: recordedBrowserRuntime.artifactClass,
    receiptPath: "evals/webmcp-browser-runtime-acceptance.json",
    recordedAt: recordedBrowserRuntime.recordedAt,
    browser: recordedBrowserRuntime.browser,
    target: recordedBrowserRuntime.target,
    checksPassed: recordedBrowserRuntime.result.receipt.lifecycleAcceptance.checks.filter((item) => item.status === "pass").length,
    checksTotal: recordedBrowserRuntime.result.receipt.lifecycleAcceptance.checks.length,
    consoleErrors: recordedBrowserRuntime.result.consoleErrors,
    probePresentAfter: recordedBrowserRuntime.result.probePresentAfter,
    postRunToolNames: recordedBrowserRuntime.result.postRunToolNames,
    containsHealthInformation: recordedBrowserRuntime.result.receipt.containsHealthInformation,
    evidenceBoundary: recordedBrowserRuntime.evidenceBoundary,
  },
  recordedInspectorExtensionRuntime: {
    artifactClass: recordedInspectorExtensionRuntime.artifactClass,
    receiptPath: "evals/webmcp-inspector-extension-runtime.json",
    recordedAt: recordedInspectorExtensionRuntime.recordedAt,
    inspector: recordedInspectorExtensionRuntime.inspector,
    browser: recordedInspectorExtensionRuntime.browser,
    target: recordedInspectorExtensionRuntime.target,
    status: recordedInspectorExtensionRuntime.result.status,
    checksPassed: recordedInspectorExtensionRuntime.result.checksPassed,
    checksTotal: recordedInspectorExtensionRuntime.result.checksTotal,
    checks: recordedInspectorExtensionRuntime.result.checks,
    publicToolNames: recordedInspectorExtensionRuntime.result.publicToolNames,
    schemasParsed: recordedInspectorExtensionRuntime.result.schemasParsed,
    schemasExpected: recordedInspectorExtensionRuntime.result.schemasExpected,
    safeExecution: recordedInspectorExtensionRuntime.result.safeExecution,
    permissionTransition: recordedInspectorExtensionRuntime.result.permissionTransition,
    sourceCapabilityAudit: recordedInspectorExtensionRuntime.sourceCapabilityAudit,
    providerBoundary: recordedInspectorExtensionRuntime.providerBoundary,
    privacyBoundary: recordedInspectorExtensionRuntime.privacyBoundary,
    evidenceBoundary: recordedInspectorExtensionRuntime.evidenceBoundary,
  },
  recordedAgenticLighthouse: {
    artifactClass: recordedAgenticLighthouse.artifactClass,
    receiptPath: "evals/webmcp-lighthouse-agentic-acceptance.json",
    recordedAt: recordedAgenticLighthouse.recordedAt,
    lighthouse: recordedAgenticLighthouse.lighthouse,
    browser: recordedAgenticLighthouse.browser,
    target: recordedAgenticLighthouse.target,
    pages: recordedAgenticLighthouse.pages,
    privacyBoundary: recordedAgenticLighthouse.privacyBoundary,
    evidenceBoundary: recordedAgenticLighthouse.evidenceBoundary,
  },
  conformance: webMcpConformanceMatrix,
  recordedSelectionEval: {
    evaluatedAt: selectionBaseline.evaluatedAt,
    requestedModel: selectionBaseline.requestedModel,
    transport: selectionBaseline.transport,
    samples: selectionBaseline.summary.samples,
    passed: selectionBaseline.summary.passed,
    failed: selectionBaseline.summary.failed,
    forbiddenPassed: selectionBaseline.summary.byIntent.forbidden.passed,
    forbiddenSamples: selectionBaseline.summary.byIntent.forbidden.samples,
    datasetDigestSha256: selectionBaseline.datasetDigestSha256,
    toolContractDigestSha256: selectionBaseline.toolContractDigestSha256,
    storesModelContentOrThinking: selectionBaseline.storesModelContentOrThinking,
    containsPatientData: selectionBaseline.containsPatientData,
  },
  implementationLandscape: webMcpImplementationLandscape,
  evidenceBoundary: "The quick judge route is a concise current-browser discovery and safe-method check. Partial recorded results do not replace Chrome Model Context Tool Inspector completion: the stock run proves one fictional local permission transition, while natural-language selection, cancellation/cleanup, production Origin Trial deployment, and clinical validation remain separate gates.",
} as const;
