/// <reference types="webmcp-types" />

import { createOutreachDraft } from "../matching/outreach.ts";
import { createTrialDiscussionBrief } from "../matching/discussionBrief.ts";
import type { FollowUpQuestion } from "../matching/followUp.ts";
import type { TrialMatch } from "../matching/engine.ts";
import type { TrialDataState } from "../trials/types.ts";
import { maxShortlistTrials, resolveShortlistedMatches } from "../matching/shortlist.ts";
import type { ConfirmedProfile } from "../profile/schema.ts";
import type { RegistryQueryPlan } from "../trials/queryBridge.ts";
import { locateDirectIdentifiers } from "../privacy/mask.ts";
import { capWebMcpOutput } from "./output.ts";
import { createBoundedPublicSearchOutput } from "./publicSearchOutput.ts";
import { getWebMcpToolTitle, webMcpImperativeContractCore } from "./toolContractCore.ts";
import type { WebMcpDisplayLanguage, WebMcpImperativeToolName } from "./toolContractCore.ts";

async function readPublicSearchResponse(response: Response): Promise<{
  trials?: TrialMatch["trial"][];
  queryPlan?: RegistryQueryPlan;
  sources?: Array<{ registry: string; count: number; retrievedAt: string; durationMs?: number; dataState?: TrialDataState }>;
  failures?: Array<{ registry: string; message: string; code?: "SOURCE_TIMEOUT" | "SOURCE_UNAVAILABLE"; durationMs?: number }>;
  disclaimer?: string;
}> {
  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Search service returned HTTP ${response.status} instead of JSON.`);
  }
  try {
    return JSON.parse(body) as Awaited<ReturnType<typeof readPublicSearchResponse>>;
  } catch {
    throw new Error("Search service returned invalid JSON.");
  }
}

export type WebMcpActivityState = "running" | "completed" | "failed" | "cancelled";

export interface WebMcpActivity {
  toolName: string;
  state: WebMcpActivityState;
}

export interface WebMcpExecutionControl {
  executionId: number;
  toolName: string;
  cancel: () => void;
}

export type WebMcpExecutionControlEvent =
  | { type: "available"; control: WebMcpExecutionControl }
  | { type: "cleared"; executionId: number };

/** What the visible note step reports back after an agent offered a summary. */
export type WebMcpAgentIntakeOutcome =
  | { state: "awaiting_confirmation"; extractedFacts: number; pendingQuestions: number }
  | { state: "organizing" }
  | { state: "failed"; reason: string }
  | { state: "unavailable"; reason: string };

export interface WebMcpAgentIntake {
  /** Puts an identifier-free summary into the visible note step and starts organization. */
  submit: (input: { summary: string }, signal: AbortSignal) => Promise<WebMcpAgentIntakeOutcome>;
  /** How long the tool waits for organization before answering `organizing`. */
  waitMs?: number;
}

export const webMcpAgentIntakeWaitMs = 8_000;
export const webMcpAgentIntakeSummaryLength = { min: 20, max: 4_000 } as const;

export interface WebMcpToolContext {
  profile?: ConfirmedProfile;
  /**
   * Present only while the person has switched agent intake permission on at
   * the visible note step. Its presence is the gate for the one tool that
   * changes page state.
   */
  agentIntake?: WebMcpAgentIntake;
  matches: TrialMatch[];
  pendingQuestions?: FollowUpQuestion[];
  matching?: boolean;
  shortlistedTrialIds?: string[];
  sensitiveConsent: boolean;
  language?: WebMcpDisplayLanguage;
  fetcher?: typeof fetch;
  onActivity?: (activity: WebMcpActivity) => void;
  onExecutionControl?: (event: WebMcpExecutionControlEvent) => void;
}

let nextWebMcpExecutionId = 0;

function combineAbortSignals(primary: AbortSignal, secondary: AbortSignal) {
  const controller = new AbortController();
  const abortFrom = (source: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(source.reason);
  };
  const onPrimaryAbort = () => abortFrom(primary);
  const onSecondaryAbort = () => abortFrom(secondary);
  if (primary.aborted) abortFrom(primary);
  else primary.addEventListener("abort", onPrimaryAbort, { once: true });
  if (secondary.aborted) abortFrom(secondary);
  else secondary.addEventListener("abort", onSecondaryAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      primary.removeEventListener("abort", onPrimaryAbort);
      secondary.removeEventListener("abort", onSecondaryAbort);
    },
  };
}

/** Resolves `undefined` once `ms` elapses so a slow visible step never hangs the agent. */
function waitBounded<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException("Agent intake aborted.", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(undefined);
    }, ms);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

const agentIntakeNextAction: Record<WebMcpAgentIntakeOutcome["state"], string> = {
  awaiting_confirmation: "Ask the person to review and confirm each extracted fact on the visible page, then switch on WebMCP permission there; contextual tools appear only after that.",
  organizing: "Cloud organization is still running on the visible page (usually 30-90 seconds). Do not call again; the person continues there.",
  failed: "Cloud organization stopped. The person can edit the note or retry from the visible page; do not resend the summary automatically.",
  unavailable: "Continue in the visible workflow; this step no longer accepts an agent summary.",
};

function buildAgentIntakeTool(intake: WebMcpAgentIntake): WebMCP.ModelContextTool {
  return {
    ...webMcpImperativeContractCore.organize_deidentified_summary,
    execute: async (input, options) => {
      const normalizedInput = typeof input === "string" ? JSON.parse(input) as { summary?: unknown } : input;
      const summary = typeof normalizedInput.summary === "string" ? normalizedInput.summary.trim() : "";
      if (summary.length < webMcpAgentIntakeSummaryLength.min || summary.length > webMcpAgentIntakeSummaryLength.max) {
        throw new Error(`summary must be ${webMcpAgentIntakeSummaryLength.min}-${webMcpAgentIntakeSummaryLength.max} characters of de-identified medical context`);
      }
      // Nothing with a direct identifier enters the page: tell the agent what
      // to remove instead of masking silently.
      const identifierKinds = [...new Set(locateDirectIdentifiers(summary).map((finding) => finding.kind))];
      if (identifierKinds.length > 0) {
        throw new Error(`Remove these direct identifiers and call again: ${identifierKinds.join(", ")}. Keep only diagnosis, stage, biomarkers, treatments, age band, and travel range.`);
      }
      const signal = options?.signal ?? new AbortController().signal;
      const outcome = await waitBounded(intake.submit({ summary }, signal), intake.waitMs ?? webMcpAgentIntakeWaitMs, signal) ?? { state: "organizing" as const };
      return capWebMcpOutput({
        ...outcome,
        acceptedCharacters: summary.length,
        nextAction: agentIntakeNextAction[outcome.state],
        privacy: "The browser masked the text before cloud organization; no fact is confirmed and no contextual tool exists until the person confirms on the page.",
      });
    },
  };
}

function withVisibleActivity(
  tool: WebMCP.ModelContextTool,
  onActivity?: WebMcpToolContext["onActivity"],
  onExecutionControl?: WebMcpToolContext["onExecutionControl"],
): WebMCP.ModelContextTool {
  if (!onActivity && !onExecutionControl) return tool;
  return {
    ...tool,
    execute: async (input, options) => {
      const executionOptions = options ?? { signal: new AbortController().signal };
      const executionId = ++nextWebMcpExecutionId;
      const humanController = new AbortController();
      const combined = onExecutionControl ? combineAbortSignals(executionOptions.signal, humanController.signal) : undefined;
      const effectiveOptions = combined ? { ...executionOptions, signal: combined.signal } : executionOptions;
      onActivity?.({ toolName: tool.name, state: "running" });
      onExecutionControl?.({
        type: "available",
        control: {
          executionId,
          toolName: tool.name,
          cancel: () => humanController.abort(new DOMException("Cancelled from the visible TrialBridge page.", "AbortError")),
        },
      });
      try {
        const output = await tool.execute(input, effectiveOptions);
        onActivity?.({ toolName: tool.name, state: "completed" });
        return output;
      } catch (error) {
        onActivity?.({ toolName: tool.name, state: effectiveOptions.signal.aborted ? "cancelled" : "failed" });
        throw error;
      } finally {
        combined?.cleanup();
        onExecutionControl?.({ type: "cleared", executionId });
      }
    },
  };
}

function prepareToolForPage(tool: WebMCP.ModelContextTool, context: WebMcpToolContext) {
  const localizedTool = context.language === "zh-Hant"
    ? { ...tool, title: getWebMcpToolTitle(tool.name as WebMcpImperativeToolName, context.language) }
    : tool;
  return withVisibleActivity(localizedTool, context.onActivity, context.onExecutionControl);
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
        // Chrome's current Origin Trial may deliver executeTool input as a
        // serialized JSON string, while the draft API delivers an object.
        // Normalize both shapes before validating the public condition.
        const normalizedInput = typeof input === "string"
          ? JSON.parse(input) as { condition?: unknown }
          : input;
        const condition = typeof normalizedInput.condition === "string" ? normalizedInput.condition.trim() : "";
        if (condition.length < 2 || condition.length > 120) throw new Error("condition must be 2-120 characters; call again with one general cancer condition");
        const response = await fetcher("/api/trials/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ condition, pageSize: 5, includeNotOpen: true }), signal: options?.signal });
        const payload = await readPublicSearchResponse(response);
        if (!response.ok && (payload.failures?.length ?? 0) === 0) throw new Error("Public registry search is unavailable; retry once or continue with the visible /trials search form");
        return createBoundedPublicSearchOutput({ query: condition, queryPlan: payload.queryPlan, trials: payload.trials ?? [], sources: payload.sources, failures: payload.failures, limitation: payload.disclaimer });
      },
    },
  ];
  // The visible note step exposes the gated intake tool; it is never combined
  // with a confirmed profile because organizing a summary replaces one.
  if (context.agentIntake && !context.profile) tools.push(buildAgentIntakeTool(context.agentIntake));
  if (!context.sensitiveConsent || !context.profile) return tools.map((tool) => prepareToolForPage(tool, context));
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
    execute: () => capWebMcpOutput(context.matches.slice(0, 5).map((match) => ({ id: match.trial.canonicalId, title: match.trial.title, status: match.status, assessments: match.assessments, detailedCriteria: Object.fromEntries((match.detailedCriteria ?? []).map((criterion) => [criterion.key, criterion.state])), potentialExclusions: match.potentialExclusions, sources: match.trial.sources }))),
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
          detailedCriteria: Object.fromEntries((match.detailedCriteria ?? []).map((criterion) => [criterion.key, criterion.state])),
          potentialExclusionSignal: match.potentialExclusions.length > 0,
          source: { registry: match.trial.sources[0].registry, id: match.trial.sources[0].registryId, url: match.trial.sources[0].url },
        })),
      });
    },
  });
  return tools.map((tool) => prepareToolForPage(tool, context));
}
