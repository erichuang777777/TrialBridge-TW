/// <reference types="webmcp-types" />

import { createOutreachDraft } from "../matching/outreach.ts";
import { createTrialDiscussionBrief } from "../matching/discussionBrief.ts";
import type { FollowUpQuestion } from "../matching/followUp.ts";
import type { TrialMatch } from "../matching/engine.ts";
import type { TrialDataState } from "../trials/types.ts";
import { maxShortlistTrials, resolveShortlistedMatches } from "../matching/shortlist.ts";
import type { ConfirmedProfile } from "../profile/schema.ts";
import type { RegistryQueryPlan } from "../trials/queryBridge.ts";
import { capWebMcpOutput } from "./output.ts";
import { createBoundedPublicSearchOutput } from "./publicSearchOutput.ts";
import { webMcpImperativeContractCore } from "./toolContractCore.ts";

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
  shortlistedTrialIds?: string[];
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
      ...webMcpImperativeContractCore.trialbridge_method,
      execute: () => ({ searchOrder: ["Taiwan", "Asia", "worldwide"], sources: ["TFDA", "ClinicalTrials.gov"], privacy: "Raw medical text is never available to WebMCP.", limitation: "Registry records are research plans, not proof of benefit or final eligibility." }),
    },
    {
      ...webMcpImperativeContractCore.search_public_cancer_trials,
      execute: async (input, options) => {
        const condition = typeof input.condition === "string" ? input.condition.trim() : "";
        if (condition.length < 2 || condition.length > 120) throw new Error("condition must be 2-120 characters; call again with one general cancer condition");
        const response = await fetcher("/api/trials/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ condition, pageSize: 5, includeNotOpen: false }), signal: options.signal });
        const payload = await response.json() as { trials?: TrialMatch["trial"][]; queryPlan?: RegistryQueryPlan; sources?: Array<{ registry: string; count: number; retrievedAt: string; durationMs?: number; dataState?: TrialDataState }>; failures?: Array<{ registry: string; message: string; code?: "SOURCE_TIMEOUT" | "SOURCE_UNAVAILABLE"; durationMs?: number }>; disclaimer?: string };
        if (!response.ok && (payload.failures?.length ?? 0) === 0) throw new Error("Public registry search is unavailable; retry once or continue with the visible /trials search form");
        return createBoundedPublicSearchOutput({ query: condition, queryPlan: payload.queryPlan, trials: payload.trials ?? [], sources: payload.sources, failures: payload.failures, limitation: payload.disclaimer });
      },
    },
  ];
  if (!context.sensitiveConsent || !context.profile) return tools.map((tool) => withVisibleActivity(tool, context.onActivity));
  tools.push({
    ...webMcpImperativeContractCore.review_trial_followups,
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
    ...webMcpImperativeContractCore.explain_confirmed_matches,
    execute: () => capWebMcpOutput(context.matches.slice(0, 5).map((match) => ({ id: match.trial.canonicalId, title: match.trial.title, status: match.status, assessments: match.assessments, potentialExclusions: match.potentialExclusions, sources: match.trial.sources }))),
  }, {
    ...webMcpImperativeContractCore.draft_trial_outreach,
    execute: (input) => {
      const match = context.matches.find((candidate) => candidate.trial.canonicalId === input.trialId);
      if (!match) throw new Error("trialId is not in the current results; use explain_confirmed_matches to review current trial IDs, then call again");
      if (input.language !== "zh-Hant" && input.language !== "en") throw new Error("language must be zh-Hant or en; call this tool again with one supported language");
      return capWebMcpOutput(createOutreachDraft(context.profile!, match.trial, input.language));
    },
  }, {
    ...webMcpImperativeContractCore.draft_trial_discussion_brief,
    execute: (input) => {
      if (input.language !== "zh-Hant" && input.language !== "en") throw new Error("language must be zh-Hant or en; call this tool again with one supported language");
      return capWebMcpOutput(createTrialDiscussionBrief(context.profile!, context.matches, input.language));
    },
  });
  const shortlistedTrialIds = [...new Set(context.shortlistedTrialIds ?? [])].slice(0, maxShortlistTrials);
  if (shortlistedTrialIds.length >= 2) tools.push({
    ...webMcpImperativeContractCore.compare_shortlisted_trials,
    execute: (input) => {
      if (input.language !== "zh-Hant" && input.language !== "en") throw new Error("language must be zh-Hant or en; call this tool again with one supported language");
      const selected = resolveShortlistedMatches(context.matches, shortlistedTrialIds);
      if (selected.length < 2) throw new Error("The visible shortlist no longer has two current trials; ask the user to select two result cards, then call again");
      return capWebMcpOutput({
        state: "shortlist_ready",
        selectedByUser: true,
        boundary: input.language === "en" ? "Public-record comparison only; the study team decides eligibility." : "僅比較公開登錄資料；資格由試驗團隊判定。",
        trials: selected.map((match) => ({
          id: match.trial.canonicalId,
          title: match.trial.title.slice(0, 120),
          status: match.status,
          region: match.trial.regionTier,
          criteria: Object.fromEntries(match.assessments.map((assessment) => [assessment.key, assessment.outcome])),
          potentialExclusionSignal: match.potentialExclusions.length > 0,
          source: { registry: match.trial.sources[0].registry, id: match.trial.sources[0].registryId, url: match.trial.sources[0].url },
        })),
      });
    },
  });
  return tools.map((tool) => withVisibleActivity(tool, context.onActivity));
}
