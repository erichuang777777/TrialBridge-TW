/// <reference types="webmcp-types" />

import { createOutreachDraft } from "../matching/outreach.ts";
import { createTrialDiscussionBrief } from "../matching/discussionBrief.ts";
import type { FollowUpQuestion } from "../matching/followUp.ts";
import type { TrialMatch } from "../matching/engine.ts";
import type { ConfirmedProfile } from "../profile/schema.ts";
import { capWebMcpOutput } from "./output.ts";

export type WebMcpActivityState = "running" | "completed" | "failed" | "cancelled";

export interface WebMcpActivity {
  toolName: string;
  state: WebMcpActivityState;
}

export interface WebMcpToolContext {
  profile?: ConfirmedProfile;
  matches: TrialMatch[];
  pendingQuestions?: FollowUpQuestion[];
  matching?: boolean;
  sensitiveConsent: boolean;
  fetcher?: typeof fetch;
  onActivity?: (activity: WebMcpActivity) => void;
}

function withVisibleActivity(tool: WebMCP.ModelContextTool, onActivity?: WebMcpToolContext["onActivity"]): WebMCP.ModelContextTool {
  if (!onActivity) return tool;
  return {
    ...tool,
    execute: async (input, options) => {
      onActivity({ toolName: tool.name, state: "running" });
      try {
        const output = await tool.execute(input, options);
        onActivity({ toolName: tool.name, state: "completed" });
        return output;
      } catch (error) {
        onActivity({ toolName: tool.name, state: options.signal.aborted ? "cancelled" : "failed" });
        throw error;
      }
    },
  };
}

export function buildTrialBridgeTools(context: WebMcpToolContext): WebMCP.ModelContextTool[] {
  const fetcher = context.fetcher ?? fetch;
  const tools: WebMCP.ModelContextTool[] = [
    {
      name: "trialbridge_method", title: "Explain TrialBridge TW method",
      description: "Call when a user asks how TrialBridge TW works. Returns the site's authoritative Taiwan-first search order, privacy boundary, sources, and limitations without patient data.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => ({ searchOrder: ["Taiwan", "Asia", "worldwide"], sources: ["TFDA", "ClinicalTrials.gov"], privacy: "Raw medical text is never available to WebMCP.", limitation: "Registry records are research plans, not proof of benefit or final eligibility." }),
    },
    {
      name: "search_public_cancer_trials", title: "Search public cancer trials",
      description: "Search public TFDA and ClinicalTrials.gov records by a non-sensitive cancer topic. Returns at most five source-linked records.",
      inputSchema: { type: "object", properties: { condition: { type: "string", description: "General non-sensitive cancer condition; never include a medical record.", minLength: 2, maxLength: 120 } }, required: ["condition"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input, options) => {
        const condition = typeof input.condition === "string" ? input.condition.trim() : "";
        if (condition.length < 2 || condition.length > 120) throw new Error("condition must be 2-120 characters; call again with one general cancer condition");
        const response = await fetcher("/api/trials/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ condition, pageSize: 5, includeNotOpen: false }), signal: options.signal });
        if (!response.ok) throw new Error("Public registry search is unavailable; retry once or continue with the visible /trials search form");
        const payload = await response.json() as { trials?: TrialMatch["trial"][] };
        return capWebMcpOutput((payload.trials ?? []).slice(0, 5).map((trial) => ({ id: trial.canonicalId, title: trial.title, region: trial.regionTier, recruitment: trial.recruitment.raw, sources: trial.sources.map((source) => ({ registry: source.registry, id: source.registryId, url: source.url, retrievedAt: source.retrievedAt })) })));
      },
    },
  ];
  if (!context.sensitiveConsent || !context.profile) return tools.map((tool) => withVisibleActivity(tool, context.onActivity));
  tools.push({
    name: "review_trial_followups", title: "Review pending trial questions",
    description: "Call when results are waiting for more information. Lists current registry-derived questions for the visible form; never records or confirms answers.",
    inputSchema: { type: "object", properties: { language: { type: "string", description: "Language for the pending questions and recovery guidance.", enum: ["zh-Hant", "en"] } }, required: ["language"], additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => {
      if (input.language !== "zh-Hant" && input.language !== "en") throw new Error("language must be zh-Hant or en; call this tool again with one supported language");
      const questions = (context.pendingQuestions ?? []).slice(0, 6);
      if (context.matching) return { state: "matching_in_progress", nextAction: "Wait for the current registry comparison, then call this tool again." };
      if (questions.length === 0 && context.matches.length > 0) return { state: "results_ready", nextAction: "Use explain_confirmed_matches to review the current comparison." };
      if (questions.length === 0) return { state: "no_pending_questions", nextAction: "Continue in the visible TrialBridge workflow; no answer can be recorded through this tool." };
      return capWebMcpOutput({
        state: "needs_user_input",
        nextAction: "Ask these questions; answers or unknown must be entered in the visible form.",
        questions: questions.map((question) => ({
          question: input.language === "en" ? question.questionEn : question.questionZhHant,
          registryField: question.registryField,
          trialCount: question.trialCount ?? 1,
        })),
      });
    },
  }, {
    name: "explain_confirmed_matches", title: "Explain confirmed-profile trial matches",
    description: "Call when a user asks why current trials are grouped or how current results compare. Returns confirmed, de-identified match explanations; raw notes are unavailable.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => capWebMcpOutput(context.matches.slice(0, 5).map((match) => ({ id: match.trial.canonicalId, title: match.trial.title, status: match.status, assessments: match.assessments, potentialExclusions: match.potentialExclusions, sources: match.trial.sources }))),
  }, {
    name: "draft_trial_outreach", title: "Draft trial outreach",
    description: "Call only to draft a message to a study team about one specific current trial. Never use for a doctor or care-team summary; creates but never sends.",
    inputSchema: { type: "object", properties: { trialId: { type: "string", description: "Canonical ID of one currently displayed trial match.", minLength: 1, maxLength: 120 }, language: { type: "string", description: "Language for the editable, unsent draft.", enum: ["zh-Hant", "en"] } }, required: ["trialId", "language"], additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => {
      const match = context.matches.find((candidate) => candidate.trial.canonicalId === input.trialId);
      if (!match) throw new Error("trialId is not in the current results; use explain_confirmed_matches to review current trial IDs, then call again");
      if (input.language !== "zh-Hant" && input.language !== "en") throw new Error("language must be zh-Hant or en; call this tool again with one supported language");
      return capWebMcpOutput(createOutreachDraft(context.profile!, match.trial, input.language));
    },
  }, {
    name: "draft_trial_discussion_brief", title: "Draft a care-team trial discussion brief",
    description: "Call when a user wants to organize current results for their doctor or care team. Uses all current matches; input is language only, never trialId. Not a study-team message.",
    inputSchema: { type: "object", properties: { language: { type: "string", description: "Output language only; the brief already uses all current matches.", enum: ["zh-Hant", "en"] } }, required: ["language"], additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => {
      if (input.language !== "zh-Hant" && input.language !== "en") throw new Error("language must be zh-Hant or en; call this tool again with one supported language");
      return capWebMcpOutput(createTrialDiscussionBrief(context.profile!, context.matches, input.language));
    },
  });
  return tools.map((tool) => withVisibleActivity(tool, context.onActivity));
}
