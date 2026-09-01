/// <reference types="webmcp-types" />

import { createOutreachDraft } from "../matching/outreach.ts";
import type { TrialMatch } from "../matching/engine.ts";
import type { ConfirmedProfile } from "../profile/schema.ts";

const MAX_OUTPUT_CHARS = 6_000;
function capped(value: unknown) { const text = JSON.stringify(value); return text.length <= MAX_OUTPUT_CHARS ? value : { truncated: true, content: text.slice(0, MAX_OUTPUT_CHARS) }; }

export interface WebMcpToolContext {
  profile?: ConfirmedProfile;
  matches: TrialMatch[];
  sensitiveConsent: boolean;
  fetcher?: typeof fetch;
}

export function buildTrialBridgeTools(context: WebMcpToolContext): WebMCP.ModelContextTool[] {
  const fetcher = context.fetcher ?? fetch;
  const tools: WebMCP.ModelContextTool[] = [
    {
      name: "trialbridge_method", title: "Explain TrialBridge TW method",
      description: "Explain the Taiwan-first search order, privacy boundary, sources, and limitations. Does not use patient data.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => ({ searchOrder: ["Taiwan", "Asia", "worldwide"], sources: ["TFDA", "ClinicalTrials.gov"], privacy: "Raw medical text is never available to WebMCP.", limitation: "Registry records are research plans, not proof of benefit or final eligibility." }),
    },
    {
      name: "search_public_cancer_trials", title: "Search public cancer trials",
      description: "Search public TFDA and ClinicalTrials.gov records by a non-sensitive cancer topic. Returns at most five source-linked records.",
      inputSchema: { type: "object", properties: { condition: { type: "string", minLength: 2, maxLength: 120 } }, required: ["condition"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input, options) => {
        const condition = typeof input.condition === "string" ? input.condition.trim() : "";
        if (condition.length < 2 || condition.length > 120) throw new Error("condition must be 2-120 characters");
        const response = await fetcher("/api/trials/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ condition, pageSize: 5, includeNotOpen: false }), signal: options.signal });
        if (!response.ok) throw new Error("Public registry search is unavailable");
        const payload = await response.json() as { trials?: TrialMatch["trial"][] };
        return capped((payload.trials ?? []).slice(0, 5).map((trial) => ({ id: trial.canonicalId, title: trial.title, region: trial.regionTier, recruitment: trial.recruitment.raw, sources: trial.sources.map((source) => ({ registry: source.registry, id: source.registryId, url: source.url, retrievedAt: source.retrievedAt })) })));
      },
    },
  ];
  if (!context.sensitiveConsent || !context.profile) return tools;
  tools.push({
    name: "explain_confirmed_trial_matches", title: "Explain confirmed-profile trial matches",
    description: "Read the current page's patient-confirmed, de-identified match explanations. Requires visible in-page consent; raw notes are unavailable.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => capped(context.matches.slice(0, 5).map((match) => ({ id: match.trial.canonicalId, title: match.trial.title, status: match.status, assessments: match.assessments, sources: match.trial.sources }))),
  }, {
    name: "draft_trial_outreach", title: "Draft trial outreach",
    description: "Create but never send an outreach draft for one current match using only confirmed, de-identified facts.",
    inputSchema: { type: "object", properties: { trialId: { type: "string", minLength: 1, maxLength: 120 }, language: { type: "string", enum: ["zh-Hant", "en"] } }, required: ["trialId", "language"], additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => {
      const match = context.matches.find((candidate) => candidate.trial.canonicalId === input.trialId);
      if (!match || (input.language !== "zh-Hant" && input.language !== "en")) throw new Error("A current match and supported language are required");
      return capped(createOutreachDraft(context.profile!, match.trial, input.language));
    },
  });
  return tools;
}
