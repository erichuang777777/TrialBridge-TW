/// <reference types="webmcp-types" />

export const publicTrialFormContractCore = {
  name: "search_public_trial_form",
  title: "Search public trial registries",
  description: "Search public TFDA and ClinicalTrials.gov cancer trial records by an English or Traditional Chinese general condition. Shows the bilingual registry query plan and results visibly.",
  inputSchema: {
    type: "object",
    properties: {
      condition: {
        type: "string",
        description: "General non-sensitive cancer condition; never paste a medical record or identifier.",
        minLength: 2,
        maxLength: 120,
      },
      includeNotOpen: {
        type: "boolean",
        description: "Include public records that are not currently accepting participants.",
      },
    },
    required: ["condition"],
    additionalProperties: false,
  },
} as const;

/**
 * Declarative twin of the note step. It renders only while the person has
 * switched agent intake permission on; there is no autosubmit, so the person
 * reviews the filled note and starts organization with the visible button.
 */
export const organizeSummaryFormContractCore = {
  name: "organize_summary_form",
  title: "Organize a de-identified note",
  description: "Fill the visible TrialBridge note with a de-identified cancer summary (no names, contact details, ID or record numbers, birth dates, or addresses). The person reviews the note and starts cloud organization; the browser masks identifiers first and every extracted fact still needs human confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "De-identified cancer summary in English or Traditional Chinese; the person still reviews and submits it.",
        minLength: 20,
        maxLength: 4000,
      },
    },
    required: ["summary"],
    additionalProperties: false,
  },
} as const;

export const webMcpImperativeContractCore = {
  trialbridge_method: {
    name: "trialbridge_method", title: "Explain TrialBridge TW method",
    description: "Use for any request to explain how TrialBridge TW searches for trials, prioritizes Taiwan then Asia then worldwide, protects information, chooses registry sources, or describes limitations. Call this tool to retrieve the site's authoritative method instead of answering from the description alone. No input or patient context is required.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  search_public_cancer_trials: {
    name: "search_public_cancer_trials", title: "Search public cancer trials",
    description: "Search public TFDA and ClinicalTrials.gov records by a non-sensitive cancer topic. Returns at most five source-linked records.",
    inputSchema: { type: "object", properties: { condition: { type: "string", description: "General non-sensitive cancer condition; never include a medical record.", minLength: 2, maxLength: 120 } }, required: ["condition"], additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  organize_deidentified_summary: {
    name: "organize_deidentified_summary", title: "Organize a de-identified summary",
    description: "Call only when the person asked to organize their own de-identified cancer summary and the visible note step shows agent intake permission on. Accepts summary text without names, contact details, ID or record numbers, birth dates, or addresses; any direct identifier is rejected before it enters the page. Starts the same masked cloud organization the person would start; every extracted fact still needs human confirmation. Never confirms facts, matches, enrolls, or sends.",
    inputSchema: { type: "object", properties: { summary: { type: "string", description: "De-identified summary (English or Traditional Chinese): diagnosis, stage, biomarkers, treatments, age band, travel range. No identifiers.", minLength: 20, maxLength: 4000 } }, required: ["summary"], additionalProperties: false },
    // Starts a visible workflow step, so it must not claim to be read-only.
    annotations: { readOnlyHint: false, untrustedContentHint: false },
  },
  review_trial_followups: {
    name: "review_trial_followups", title: "Review pending trial questions",
    description: "Call when results are waiting for more information. Lists current registry-derived questions for the visible form; never records or confirms answers.",
    inputSchema: { type: "object", properties: { language: { type: "string", description: "Language for the pending questions and recovery guidance.", enum: ["zh-Hant", "en"] } }, required: ["language"], additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  explain_confirmed_matches: {
    name: "explain_confirmed_matches", title: "Explain confirmed-profile trial matches",
    description: "Call when a user asks why current trials are grouped or how current results compare. Returns confirmed, de-identified match explanations; raw notes are unavailable.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  draft_trial_outreach: {
    name: "draft_trial_outreach", title: "Draft trial outreach",
    description: "Call only to draft a message to a study team about one specific current trial. Never use for a doctor or care-team summary; creates but never sends.",
    inputSchema: { type: "object", properties: { trialId: { type: "string", description: "Canonical ID of one currently displayed trial match.", minLength: 1, maxLength: 120 }, language: { type: "string", description: "Language for the editable, unsent draft.", enum: ["zh-Hant", "en"] } }, required: ["trialId", "language"], additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  draft_trial_discussion_brief: {
    name: "draft_trial_discussion_brief", title: "Draft a care-team trial discussion brief",
    description: "Call when a user wants to organize current results for their doctor or care team. Uses all current matches; input is language only, never trialId. Not a study-team message.",
    inputSchema: { type: "object", properties: { language: { type: "string", description: "Output language only; the brief already uses all current matches.", enum: ["zh-Hant", "en"] } }, required: ["language"], additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  compare_shortlisted_trials: {
    name: "compare_shortlisted_trials", title: "Compare the visible trial shortlist",
    description: "Call only when a user asks to compare trials they already added to the visible shortlist. Reads two or three user-selected trials; never chooses or changes the shortlist.",
    inputSchema: { type: "object", properties: { language: { type: "string", description: "Output language only; trial IDs come from the visible user-controlled shortlist.", enum: ["zh-Hant", "en"] } }, required: ["language"], additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
} as const satisfies Record<string, Omit<WebMCP.ModelContextTool, "execute">>;

export type WebMcpImperativeToolName = keyof typeof webMcpImperativeContractCore;
export type WebMcpDisplayLanguage = "en" | "zh-Hant";

export const webMcpZhHantToolTitles = {
  trialbridge_method: "說明 TrialBridge TW 方法",
  search_public_cancer_trials: "搜尋公開癌症臨床試驗",
  organize_deidentified_summary: "整理去識別化病況摘要",
  review_trial_followups: "檢視待確認的試驗問題",
  explain_confirmed_matches: "說明已確認資料的試驗配對",
  draft_trial_outreach: "建立試驗團隊聯絡草稿",
  draft_trial_discussion_brief: "建立照護團隊試驗討論摘要",
  compare_shortlisted_trials: "比較已選取的試驗清單",
} as const satisfies Record<WebMcpImperativeToolName, string>;

export function getWebMcpToolTitle(name: WebMcpImperativeToolName, language: WebMcpDisplayLanguage) {
  return language === "zh-Hant" ? webMcpZhHantToolTitles[name] : webMcpImperativeContractCore[name].title;
}
