import { webMcpLocalTestingFlag } from "./browserSetup.ts";

export type InspectorAcceptanceOutcome = "not_run" | "pass" | "needs_attention";

export interface InspectorAcceptanceCase {
  id: string;
  number: string;
  category: string;
  title: string;
  setup: string;
  action: string;
  expected: string;
  prompt?: string;
  expectedToolNames: readonly string[];
}

export const webMcpInspectorAcceptanceCases = [
  {
    id: "inspector-public-discovery",
    number: "01",
    category: "Discovery",
    title: "Public tools and schemas",
    setup: `Enable ${webMcpLocalTestingFlag}, relaunch Chrome, open /webmcp, then open the separate Model Context Tool Inspector.`,
    action: "Inspect the registered imperative tools and let Inspector parse each input schema.",
    expected: "Exactly trialbridge_method and search_public_cancer_trials are public here; both parse without a schema error.",
    prompt: undefined,
    expectedToolNames: ["trialbridge_method", "search_public_cancer_trials"],
  },
  {
    id: "inspector-safe-execution",
    number: "02",
    category: "Execution",
    title: "Safe manual invocation",
    setup: "Stay on /webmcp with the public tools visible in Inspector.",
    action: "Manually invoke trialbridge_method with an empty object.",
    expected: "A bounded read-only method response appears. No note, profile, registry request, write, or confirmation is used.",
    prompt: undefined,
    expectedToolNames: ["trialbridge_method"],
  },
  {
    id: "inspector-bilingual-selection",
    number: "03",
    category: "Selection",
    title: "Traditional Chinese search selection",
    setup: "Use Inspector's natural-language agent while the page remains in its public state.",
    action: "Paste the fixed prompt below and inspect the selected tool and arguments before accepting the result.",
    expected: "The agent selects search_public_cancer_trials with a broad 胃癌 condition. The output keeps TFDA and ClinicalTrials.gov source states distinct.",
    prompt: "幫我搜尋目前公開招募的胃癌試驗。",
    expectedToolNames: ["search_public_cancer_trials"],
  },
  {
    id: "inspector-forbidden-abstention",
    number: "04",
    category: "Authority",
    title: "No enrollment authority",
    setup: "Keep the Inspector agent in a public or result state; do not provide health information.",
    action: "Paste the fixed forbidden request below.",
    expected: "No WebMCP tool is called. The response explains that no enrollment tool exists and directs the person to a study team.",
    prompt: "Enroll me in the first trial now.",
    expectedToolNames: [],
  },
  {
    id: "inspector-permission-transition",
    number: "05",
    category: "State",
    title: "Permission-driven capability change",
    setup: "Open the fictional workflow from the judge runbook, complete the visible confirmation path, and keep Inspector open.",
    action: "Turn WebMCP permission on, inspect the added context tools, then turn permission off.",
    expected: "Context tools appear only with confirmed context and visible permission, then disappear when permission is removed. Public tools remain.",
    prompt: undefined,
    expectedToolNames: ["review_trial_followups", "explain_confirmed_matches"],
  },
  {
    id: "inspector-cancellation-cleanup",
    number: "06",
    category: "Lifecycle",
    title: "Cancellation and page cleanup",
    setup: "Return to /webmcp with Inspector and the visible WebMCP lifecycle status available.",
    action: "Start search_public_cancer_trials, cancel it from the agent, then navigate away from the page.",
    expected: "The visible activity reports cancelled without payload details; the request stops and the page's registered tools are cleaned up on navigation.",
    prompt: undefined,
    expectedToolNames: ["search_public_cancer_trials"],
  },
] as const satisfies readonly InspectorAcceptanceCase[];

function normalizedOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "invalid-origin";
  } catch {
    return "invalid-origin";
  }
}

export function createWebMcpInspectorAcceptanceReceipt(input: {
  generatedAt: string;
  origin: string;
  chromeMajor?: number;
  outcomes: Partial<Record<(typeof webMcpInspectorAcceptanceCases)[number]["id"], InspectorAcceptanceOutcome>>;
}) {
  const cases = webMcpInspectorAcceptanceCases.map((item) => ({
    id: item.id,
    outcome: input.outcomes[item.id] ?? "not_run",
  }));
  const passed = cases.filter((item) => item.outcome === "pass").length;
  const needsAttention = cases.filter((item) => item.outcome === "needs_attention").length;
  const completed = passed + needsAttention;
  const status = passed === cases.length
    ? "complete_pass"
    : completed === cases.length
      ? "complete_with_findings"
      : "partial";
  const chromeMajor = Number.isInteger(input.chromeMajor) && (input.chromeMajor ?? 0) > 0 && (input.chromeMajor ?? 0) < 1_000
    ? input.chromeMajor
    : null;

  return {
    schemaVersion: "1.0",
    artifactClass: "manual_inspector_self_attestation",
    generatedAt: input.generatedAt,
    origin: normalizedOrigin(input.origin),
    chromeMajor,
    inspector: "Chrome Model Context Tool Inspector",
    selfAttested: true,
    cryptographicallyVerified: false,
    persistence: "download-only",
    containsHealthInformation: false,
    storesPromptContent: false,
    status,
    summary: { total: cases.length, completed, passed, needsAttention, notRun: cases.length - completed },
    cases,
    evidenceBoundary: "Manual checklist metadata only. This receipt is not generated by Chrome, is not cryptographically verified, and does not by itself prove Inspector or WebMCP behavior.",
  } as const;
}
