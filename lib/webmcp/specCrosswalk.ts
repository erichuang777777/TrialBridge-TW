export type WebMcpSpecCrosswalkStatus = "implemented" | "explainer_aligned";

const upstreamDraft = "https://webmachinelearning.github.io/webmcp/";

export const webMcpSpecCrosswalk = [
  {
    id: "S-01",
    status: "implemented",
    statusLabel: "Implemented",
    feature: "Secure document entry point",
    standardState: "Draft IDL: [SecureContext] Document.modelContext",
    specUrl: `${upstreamDraft}#document-extension`,
    implementation: "TrialBridge feature-detects document.modelContext after hydration and keeps the full human workflow available when the browser preview is absent.",
    verification: "Repository + recorded Chrome runtime",
    evidence: ["app/components/WebMcpBridge.tsx", "evals/webmcp-browser-runtime-acceptance.json"],
  },
  {
    id: "S-02",
    status: "implemented",
    statusLabel: "Implemented",
    feature: "Schema-bounded registration",
    standardState: "Draft ModelContext.registerTool() and ModelContextTool",
    specUrl: `${upstreamDraft}#model-context-container`,
    implementation: "Seven imperative capabilities use unique names, bounded JSON Schemas, explicit descriptions, and no enrollment or send authority.",
    verification: "Repository verifier + contract catalog",
    evidence: ["lib/webmcp/toolContractCore.ts", "scripts/verify-webmcp.ts", "app/webmcp/contracts.json/route.ts"],
  },
  {
    id: "S-03",
    status: "implemented",
    statusLabel: "Implemented",
    feature: "Origin-scoped discovery",
    standardState: "Draft ModelContext.getTools()",
    specUrl: `${upstreamDraft}#model-context-container`,
    implementation: "The live surface verifies the exact expected tool set with getTools({ fromOrigins: [location.origin] }) instead of assuming registration succeeded.",
    verification: "Live diagnostic + recorded Chrome runtime",
    evidence: ["app/components/WebMcpBridge.tsx", "app/webmcp/_components/WebMcpDiagnostics.tsx", "evals/webmcp-browser-runtime-acceptance.json"],
  },
  {
    id: "S-04",
    status: "implemented",
    statusLabel: "Implemented",
    feature: "Bounded execution compatibility",
    standardState: "Draft ModelContext.executeTool()",
    specUrl: `${upstreamDraft}#model-context-container`,
    implementation: "The no-health-data lifecycle suite covers execution while one narrow compatibility adapter supports draft object input and the current Chrome serialized-input profile.",
    verification: "Two compatibility profiles + six-check runtime suite",
    evidence: ["lib/webmcp/compatibility.ts", "lib/webmcp/runtimeAcceptance.ts", "tests/webmcp-compatibility.test.ts"],
  },
  {
    id: "S-05",
    status: "implemented",
    statusLabel: "Implemented",
    feature: "Cancellation and capability changes",
    standardState: "Draft AbortSignal lifecycle and toolchange event",
    specUrl: `${upstreamDraft}#pending-tool-executions`,
    implementation: "Registration cleanup uses AbortSignal; execution cancellation reaches fetch and both registries; toolchange and probe removal are separately checked.",
    verification: "Repository chain + recorded Chrome runtime",
    evidence: ["lib/webmcp/runtimeAcceptance.ts", "lib/trials/search.ts", "tests/webmcp-runtime-acceptance.test.ts"],
  },
  {
    id: "S-06",
    status: "implemented",
    statusLabel: "Implemented",
    feature: "Origin and permissions boundary",
    standardState: "Draft tools Permissions Policy and exposedTo option",
    specUrl: `${upstreamDraft}#permissions-policy`,
    implementation: "Responses send Permissions-Policy: tools=(self), and every imperative registration exposes tools only to the current trustworthy origin.",
    verification: "Header check + registration source",
    evidence: ["next.config.ts", "app/components/WebMcpBridge.tsx", "app/webmcp/_components/WebMcpDiagnostics.tsx"],
  },
  {
    id: "S-07",
    status: "implemented",
    statusLabel: "Implemented",
    feature: "Read-only and untrusted-content hints",
    standardState: "Draft annotations and prompt-injection mitigation",
    specUrl: `${upstreamDraft}#mitigation-untrusted-annotation`,
    implementation: "All imperative tools declare readOnlyHint; every registry-derived capability also declares untrustedContentHint and returns capped, source-linked output.",
    verification: "Contract verifier + output tests",
    evidence: ["lib/webmcp/toolContractCore.ts", "lib/webmcp/output.ts", "tests/webmcp.test.ts"],
  },
  {
    id: "S-08",
    status: "explainer_aligned",
    statusLabel: "Explainer-aligned",
    feature: "Visible declarative form",
    standardState: "Upstream draft section is explicitly TODO; current explainer defines the working profile",
    specUrl: `${upstreamDraft}#declarative-api`,
    secondarySourceUrl: "https://github.com/webmachinelearning/webmcp/blob/main/declarative-api-explainer.md",
    implementation: "The public search form uses toolname, tooldescription, toolparamdescription, toolautosubmit, agentInvoked, and respondWith() without a hidden duplicate form.",
    verification: "Repository verifier + visible form tests",
    evidence: ["app/components/TrialDatabase.tsx", "types/webmcp-declarative.d.ts", "tests/readiness.test.ts"],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  status: WebMcpSpecCrosswalkStatus;
  statusLabel: string;
  feature: string;
  standardState: string;
  specUrl: string;
  secondarySourceUrl?: string;
  implementation: string;
  verification: string;
  evidence: readonly string[];
}>;

export const webMcpSpecCrosswalkBundle = {
  schemaVersion: "1.0",
  auditedAt: "2026-09-02",
  artifactClass: "source_linked_spec_crosswalk_not_protocol_metadata",
  upstreamDraft,
  upstreamCommit: "41d12f057167ccf5954dbcf49d99502cb6c84491",
  summary: {
    clauses: webMcpSpecCrosswalk.length,
    implemented: webMcpSpecCrosswalk.filter((item) => item.status === "implemented").length,
    explainerAligned: webMcpSpecCrosswalk.filter((item) => item.status === "explainer_aligned").length,
    claimedNormativeDeclarativeConformance: false,
  },
  privacyBoundary: {
    containsHealthInformation: false,
    readsCurrentBrowserSession: false,
    readsMedicalWorkflowState: false,
  },
  clauses: webMcpSpecCrosswalk,
  evidenceBoundary: "This is a dated implementation-to-draft crosswalk. It does not turn draft or explainer text into a normative conformance claim and does not replace current-browser or Inspector evidence.",
} as const;
