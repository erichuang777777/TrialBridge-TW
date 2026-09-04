import { webMcpToolContractCatalog } from "./toolContractCatalog.ts";

export type WebMcpCapabilityStateKey = "public" | "intake" | "confirmed_locked" | "permission" | "shortlist";

const declarativeToolNames = webMcpToolContractCatalog.filter((tool) => tool.kind === "Declarative").map((tool) => tool.name);
const publicImperativeToolNames = webMcpToolContractCatalog.filter((tool) => tool.kind === "Imperative" && tool.availabilityGroup === "public").map((tool) => tool.name);
const intakeToolNames = webMcpToolContractCatalog.filter((tool) => tool.kind === "Imperative" && tool.availabilityGroup === "intake").map((tool) => tool.name);
const permissionToolNames = webMcpToolContractCatalog.filter((tool) => tool.kind === "Imperative" && tool.availabilityGroup === "permission").map((tool) => tool.name);
const shortlistToolNames = webMcpToolContractCatalog.filter((tool) => tool.kind === "Imperative" && tool.availabilityGroup === "shortlist").map((tool) => tool.name);

function createState(input: {
  key: WebMcpCapabilityStateKey;
  step: number;
  shortLabel: string;
  title: string;
  humanAction: string;
  visibleState: string;
  registrationEffect: string;
  whyItMatters: string;
  /** Agent intake permission switched on at the visible note step (no confirmed context yet). */
  intakePermission: boolean;
  confirmedContext: boolean;
  visiblePermission: boolean;
  shortlistSelections: number;
}) {
  const activeImperativeToolNames = [
    ...publicImperativeToolNames,
    ...(input.intakePermission && !input.confirmedContext ? intakeToolNames : []),
    ...(input.confirmedContext && input.visiblePermission ? permissionToolNames : []),
    ...(input.confirmedContext && input.visiblePermission && input.shortlistSelections >= 2 ? shortlistToolNames : []),
  ];
  return { ...input, activeImperativeToolNames } as const;
}

export const webMcpCapabilityStates = [
  createState({
    key: "public", step: 1, shortLabel: "Public", title: "Public page only",
    humanAction: "Open TrialBridge TW without entering medical context.",
    visibleState: "No confirmed summary, intake permission, or WebMCP permission is available.",
    registrationEffect: "Only the two public imperative tools register.",
    whyItMatters: "Method and public-registry search do not need health context.",
    intakePermission: false, confirmedContext: false, visiblePermission: false, shortlistSelections: 0,
  }),
  createState({
    key: "intake", step: 2, shortLabel: "Intake", title: "Agent intake permission on · note step",
    humanAction: "Switch on agent intake permission beside the visible note before anything is organized.",
    visibleState: "The note step accepts a de-identified summary from an agent; direct identifiers are rejected and the person still confirms every fact.",
    registrationEffect: "One state-changing intake tool is added, for three imperative tools; it disappears once organization starts.",
    whyItMatters: "The only tool that changes page state is gated by a visible switch and scoped to the note step.",
    intakePermission: true, confirmedContext: false, visiblePermission: false, shortlistSelections: 0,
  }),
  createState({
    key: "confirmed_locked", step: 3, shortLabel: "Confirmed", title: "Summary confirmed · permission off",
    humanAction: "Correct and confirm every extracted fact in the visible page.",
    visibleState: "A confirmed, de-identified summary exists, but agent access is still off.",
    registrationEffect: "No contextual tool is added and the intake tool is gone; the count returns to two.",
    whyItMatters: "Confirmation is not treated as permission for an agent to read context.",
    intakePermission: false, confirmedContext: true, visiblePermission: false, shortlistSelections: 0,
  }),
  createState({
    key: "permission", step: 4, shortLabel: "Permission", title: "Visible permission enabled",
    humanAction: "Enable the WebMCP permission beside the confirmed workflow.",
    visibleState: "Confirmed context may be read by bounded, read-only tools.",
    registrationEffect: "Four contextual tools are added, for six imperative tools total.",
    whyItMatters: "The agent can explain, ask, and draft, but still cannot send or enroll.",
    intakePermission: false, confirmedContext: true, visiblePermission: true, shortlistSelections: 0,
  }),
  createState({
    key: "shortlist", step: 5, shortLabel: "Shortlist", title: "Two visible trials shortlisted",
    humanAction: "Add a second result card to the user-controlled shortlist.",
    visibleState: "The page now holds two explicit human selections.",
    registrationEffect: "The shortlist comparison tool is added, for seven imperative tools total.",
    whyItMatters: "The agent may compare the selection but cannot choose or change it.",
    intakePermission: false, confirmedContext: true, visiblePermission: true, shortlistSelections: 2,
  }),
] as const;

export const webMcpCapabilityStateBundle = {
  schemaVersion: "1.1",
  auditedAt: "2026-09-04",
  artifactClass: "synthetic_capability_state_model_not_runtime_evidence",
  declarativeToolNames,
  imperativeToolCount: publicImperativeToolNames.length + intakeToolNames.length + permissionToolNames.length + shortlistToolNames.length,
  states: webMcpCapabilityStates,
  privacyBoundary: {
    containsHealthInformation: false,
    executesTools: false,
    readsCurrentBrowserSession: false,
    persistence: "static repository model",
  },
  evidenceBoundary: "The state model is verified against runtime tool construction but does not prove current-browser registration or Inspector behavior.",
} as const;
