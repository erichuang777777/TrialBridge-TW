import { maxWebMcpOutputChars } from "./output.ts";
import { publicTrialFormContractCore, webMcpImperativeContractCore } from "./toolContractCore.ts";

export type WebMcpAvailabilityGroup = "public" | "permission" | "shortlist";
export type WebMcpToolKind = "Declarative" | "Imperative";

type ContractCore = {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, { type: string; description?: string; enum?: readonly string[]; minLength?: number; maxLength?: number }>;
    required?: readonly string[];
    additionalProperties: boolean;
  };
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
};

type ContractMetadata = {
  kind: WebMcpToolKind;
  registration: "visible_form" | "registerTool";
  availabilityGroup: WebMcpAvailabilityGroup;
  availability: string;
  boundary: string;
  humanControl: string;
  recovery: string;
  untrustedOutput: boolean;
  sourceFile: string;
};

function buildCatalogEntry(core: ContractCore, metadata: ContractMetadata) {
  const required = new Set(core.inputSchema.required ?? []);
  const parameters = Object.entries(core.inputSchema.properties).map(([name, parameter]) => ({
    name,
    type: parameter.type,
    description: parameter.description ?? "",
    required: required.has(name),
    ...(parameter.enum ? { enum: [...parameter.enum] } : {}),
    ...(typeof parameter.minLength === "number" ? { minLength: parameter.minLength } : {}),
    ...(typeof parameter.maxLength === "number" ? { maxLength: parameter.maxLength } : {}),
  }));
  const nameCharacters = core.name.length;
  const descriptionCharacters = core.description.length;
  const maxParameterDescriptionCharacters = Math.max(0, ...parameters.map((parameter) => parameter.description.length));
  return {
    ...core,
    ...metadata,
    parameters,
    readOnlyBehavior: true,
    browserHints: metadata.kind === "Imperative" ? {
      readOnlyHint: core.annotations?.readOnlyHint === true,
      untrustedContentHint: core.annotations?.untrustedContentHint === true,
    } : null,
    budgets: {
      nameCharacters,
      nameLimit: 30,
      descriptionCharacters,
      descriptionLimit: 500,
      maxParameterDescriptionCharacters,
      parameterDescriptionLimit: 150,
      outputCharacterLimit: maxWebMcpOutputChars,
      withinGuidance: nameCharacters <= 30 && descriptionCharacters <= 500 && maxParameterDescriptionCharacters <= 150 && maxWebMcpOutputChars <= 1_500,
    },
  } as const;
}

export const webMcpToolContractCatalog = [
  buildCatalogEntry(publicTrialFormContractCore, {
    kind: "Declarative", registration: "visible_form", availabilityGroup: "public", availability: "Visible on /trials",
    boundary: "Public condition only", humanControl: "The visible form is focused, populated, and remains reviewable.",
    recovery: "Validation stays beside the visible form; a failed registry preserves source-level recovery.", untrustedOutput: true,
    sourceFile: "app/components/TrialDatabase.tsx",
  }),
  buildCatalogEntry(webMcpImperativeContractCore.trialbridge_method, {
    kind: "Imperative", registration: "registerTool", availabilityGroup: "public", availability: "Always public",
    boundary: "No patient context", humanControl: "Explains product method only; no workflow state changes.",
    recovery: "No input is required; unsupported browsers retain the human method page.", untrustedOutput: false,
    sourceFile: "lib/webmcp/tools.ts",
  }),
  buildCatalogEntry(webMcpImperativeContractCore.search_public_cancer_trials, {
    kind: "Imperative", registration: "registerTool", availabilityGroup: "public", availability: "Always public",
    boundary: "Bilingual query plan · untrusted registry output", humanControl: "Accepts one general cancer topic and never a medical record.",
    recovery: "Returns per-registry timeout/unavailable state and a visible-search fallback.", untrustedOutput: true,
    sourceFile: "lib/webmcp/tools.ts",
  }),
  buildCatalogEntry(webMcpImperativeContractCore.review_trial_followups, {
    kind: "Imperative", registration: "registerTool", availabilityGroup: "permission", availability: "Permission-gated",
    boundary: "Questions only · never records answers", humanControl: "Answers and unknown choices remain in the visible form.",
    recovery: "Explains matching-in-progress, results-ready, or no-pending-question states.", untrustedOutput: true,
    sourceFile: "lib/webmcp/tools.ts",
  }),
  buildCatalogEntry(webMcpImperativeContractCore.explain_confirmed_matches, {
    kind: "Imperative", registration: "registerTool", availabilityGroup: "permission", availability: "Permission-gated",
    boundary: "Confirmed, de-identified context only", humanControl: "Reads current visible results without deciding eligibility.",
    recovery: "The visible workflow remains available when the capability is absent.", untrustedOutput: true,
    sourceFile: "lib/webmcp/tools.ts",
  }),
  buildCatalogEntry(webMcpImperativeContractCore.draft_trial_outreach, {
    kind: "Imperative", registration: "registerTool", availabilityGroup: "permission", availability: "Permission-gated",
    boundary: "Creates an unsent draft", humanControl: "The person reviews and sends outside TrialBridge, if desired.",
    recovery: "Rejects trial IDs outside current visible results and points back to result review.", untrustedOutput: true,
    sourceFile: "lib/webmcp/tools.ts",
  }),
  buildCatalogEntry(webMcpImperativeContractCore.draft_trial_discussion_brief, {
    kind: "Imperative", registration: "registerTool", availabilityGroup: "permission", availability: "Permission-gated",
    boundary: "Local care-team brief · never sent", humanControl: "The person previews and explicitly downloads the local brief.",
    recovery: "Invalid language receives a supported-language correction.", untrustedOutput: true,
    sourceFile: "lib/webmcp/tools.ts",
  }),
  buildCatalogEntry(webMcpImperativeContractCore.compare_shortlisted_trials, {
    kind: "Imperative", registration: "registerTool", availabilityGroup: "shortlist", availability: "2–3 visible selections",
    boundary: "Reads only the user-controlled shortlist", humanControl: "The person chooses, orders, and removes every compared trial.",
    recovery: "If fewer than two current selections remain, asks the person to select result cards.", untrustedOutput: true,
    sourceFile: "lib/webmcp/tools.ts",
  }),
] as const;

export const webMcpToolContractBundle = {
  schemaVersion: "1.0",
  contractVersion: "2026-09-02.1",
  auditedAt: "2026-09-02",
  artifactClass: "tool_contract_catalog_not_protocol_metadata",
  standardProfile: {
    imperativeApi: "https://developer.chrome.com/docs/ai/webmcp/imperative-api",
    declarativeApi: "https://developer.chrome.com/docs/ai/webmcp/declarative-api",
    securityGuidance: "https://developer.chrome.com/docs/ai/webmcp/secure-tools",
  },
  privacyBoundary: {
    containsHealthInformation: false,
    readsCurrentBrowserSession: false,
    readsMedicalWorkflowState: false,
    persistence: "static public JSON",
  },
  summary: {
    tools: webMcpToolContractCatalog.length,
    declarative: webMcpToolContractCatalog.filter((item) => item.kind === "Declarative").length,
    imperative: webMcpToolContractCatalog.filter((item) => item.kind === "Imperative").length,
    readOnlyBehavior: webMcpToolContractCatalog.filter((item) => item.readOnlyBehavior).length,
    writeAuthority: 0,
    untrustedOutput: webMcpToolContractCatalog.filter((item) => item.untrustedOutput).length,
    withinChromeGuidance: webMcpToolContractCatalog.filter((item) => item.budgets.withinGuidance).length,
  },
  contracts: webMcpToolContractCatalog,
  evidenceBoundary: "Static implementation contracts only. This catalog is not a WebMCP protocol endpoint and does not prove current-browser discovery, execution, or Inspector behavior.",
} as const;
