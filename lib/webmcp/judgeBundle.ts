import selectionBaseline from "../../evals/webmcp-selection-baseline.json" with { type: "json" };
import { webMcpCapabilityInventory } from "./capabilityInventory.ts";
import { webMcpCriticalJourney } from "./criticalJourney.ts";
import { webMcpImplementationLandscape } from "./implementationLandscape.ts";
import { webMcpInspectorAcceptanceCases } from "./inspectorAcceptance.ts";

export type WebMcpEvidenceClass = "repository_verified" | "recorded_model_eval" | "manual_gate";

export const webMcpConformanceMatrix = [
  {
    id: "C-01",
    evidenceClass: "repository_verified",
    evidenceLabel: "Repository verified",
    requirement: "Visible declarative tool",
    implementation: "The public trial form is the tool and returns through the same visible submit path.",
    evidence: ["app/trials/_components/TrialDatabaseExplorer.tsx", "tests/readiness.test.ts"],
  },
  {
    id: "C-02",
    evidenceClass: "repository_verified",
    evidenceLabel: "Repository verified",
    requirement: "Typed imperative discovery",
    implementation: "Seven schema-bounded tools use registerTool(), getTools(), and executeTool() without write authority.",
    evidence: ["lib/webmcp/tools.ts", "scripts/verify-webmcp.ts"],
  },
  {
    id: "C-03",
    evidenceClass: "repository_verified",
    evidenceLabel: "Repository verified",
    requirement: "State-scoped capabilities",
    implementation: "Consent, confirmed context, pending questions, and the visible shortlist determine which tools exist.",
    evidence: ["app/components/WebMcpBridge.tsx", "tests/webmcp.test.ts"],
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
    evidence: ["lib/webmcp/tools.ts", "lib/trials/search.ts", "tests/registry-layer.test.ts"],
  },
  {
    id: "C-07",
    evidenceClass: "repository_verified",
    evidenceLabel: "Repository verified",
    requirement: "Progressive enhancement",
    implementation: "The human workflow remains complete when document.modelContext is unavailable.",
    evidence: ["app/components/WebMcpBridge.tsx", "app/trials/_components/TrialDatabaseExplorer.tsx"],
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
    evidenceClass: "manual_gate",
    evidenceLabel: "Manual Inspector gate",
    requirement: "Browser natural-language selection",
    implementation: "The in-product six-check kit standardizes discovery, selection, permission, cancellation, and cleanup evidence, but Chrome Model Context Tool Inspector must still verify every outcome.",
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
    manualInspectorCases: webMcpInspectorAcceptanceCases.length,
    ...evidenceCounts,
  },
  capabilities: webMcpCapabilityInventory,
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
  evidenceBoundary: "Repository checks and a recorded model-selection eval do not replace Chrome Model Context Tool Inspector or clinical validation.",
} as const;
