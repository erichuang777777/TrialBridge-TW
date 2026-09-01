/// <reference types="webmcp-types" />
import assert from "node:assert/strict";
import test from "node:test";
import { buildTrialBridgeTools } from "../lib/webmcp/tools.ts";
import { capWebMcpOutput, maxWebMcpOutputChars } from "../lib/webmcp/output.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";
import type { WebMcpActivity } from "../lib/webmcp/tools.ts";
import type { CriterionAssessment, TrialMatch } from "../lib/matching/engine.ts";

const draft = profileDraftSchema.parse({ schemaVersion: "1.0", language: "en", subjectRole: "patient", facts: [{ id: "fact_cancer_1", domain: "cancer_type", value: "gastric cancer", displayZhHant: "胃癌", displayEn: "Gastric cancer", source: "user_statement", confidence: 1, confirmed: false }], missingQuestions: [], safetyNote: "Draft only." });
const profile = confirmProfile(draft, {}, "patient", "2026-09-01T00:00:00.000Z");

const assessmentKeys: CriterionAssessment["key"][] = ["condition", "recruitment", "age", "sex", "location", "eligibility_details"];
function syntheticMatch(id: string, title: string): TrialMatch {
  return {
    trial: {
      canonicalId: id, identifiers: [id], title, language: "en", conditions: ["Synthetic gastric cancer"], phases: ["Phase 2"], interventions: ["Synthetic study medicine"], studyType: "INTERVENTIONAL",
      recruitment: { raw: "Recruiting", category: "open", acceptingNewParticipants: true }, eligibility: { combined: "Synthetic criteria", minimumAge: "18 Years", maximumAge: "80 Years", sex: "ALL" },
      locations: [{ country: "Taiwan", city: "Taipei" }], contacts: [], regionTier: "taiwan",
      sources: [{ registry: "ClinicalTrials.gov", registryId: id, url: `https://clinicaltrials.gov/study/${id}`, retrievedAt: "2026-09-01T00:00:00.000Z" }],
    },
    status: "needs_review",
    assessments: assessmentKeys.map((key) => ({ key, outcome: key === "eligibility_details" ? "unknown" : "possibly_met", patientFactIds: [], registryField: key, explanationEn: `Synthetic ${key} comparison.`, explanationZhHant: `虛構 ${key} 比較。` })),
    potentialExclusions: [],
  };
}

test("WebMCP exposes public tools without patient context and no write tools", () => {
  const tools = buildTrialBridgeTools({ matches: [], sensitiveConsent: false });
  assert.deepEqual(tools.map((tool) => tool.name), ["trialbridge_method", "search_public_cancer_trials"]);
  assert.equal(tools.every((tool) => tool.annotations?.readOnlyHint), true);
  assert.equal(tools.some((tool) => /send|enroll|submit|book/i.test(tool.name)), false);
  assert.equal(tools.every((tool) => tool.name.length <= 30), true);
  assert.equal(tools.flatMap((tool) => Object.values((tool.inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {})).every((parameter) => Boolean(parameter.description) && parameter.description!.length <= 150), true);
  assert.equal(JSON.stringify(tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))).toLowerCase().includes("rawnote"), false);
});

test("sensitive WebMCP tools register only with confirmed-profile consent", () => {
  assert.equal(buildTrialBridgeTools({ profile, matches: [], sensitiveConsent: false }).length, 2);
  const tools = buildTrialBridgeTools({ profile, matches: [], sensitiveConsent: true });
  assert.deepEqual(tools.slice(2).map((tool) => tool.name), ["review_trial_followups", "explain_confirmed_matches", "draft_trial_outreach", "draft_trial_discussion_brief"]);
  assert.equal(tools.slice(1).every((tool) => tool.annotations?.untrustedContentHint), true);
});

test("shortlist comparison tool appears only after two visible selections and cannot choose trials", async () => {
  const matches = [syntheticMatch("NCT00000001", "Synthetic trial one"), syntheticMatch("NCT00000002", "Synthetic trial two")];
  assert.equal(buildTrialBridgeTools({ profile, matches, sensitiveConsent: true, shortlistedTrialIds: [matches[0].trial.canonicalId] }).some((tool) => tool.name === "compare_shortlisted_trials"), false);
  const tool = buildTrialBridgeTools({ profile, matches, sensitiveConsent: true, shortlistedTrialIds: matches.map((match) => match.trial.canonicalId) }).find((candidate) => candidate.name === "compare_shortlisted_trials");
  assert.ok(tool);
  assert.deepEqual((tool.inputSchema as { properties: Record<string, unknown> }).properties, { language: { type: "string", description: "Output language only; trial IDs come from the visible user-controlled shortlist.", enum: ["zh-Hant", "en"] } });
  const output = await tool.execute({ language: "en" }, { signal: new AbortController().signal });
  const serialized = JSON.stringify(output);
  assert.match(serialized, /shortlist_ready/);
  assert.match(serialized, /selectedByUser/);
  assert.match(serialized, /NCT00000001/);
  assert.match(serialized, /NCT00000002/);
  assert.doesNotMatch(serialized, /fact_cancer_1|gastric cancer/i);
  assert.equal(serialized.length <= maxWebMcpOutputChars, true);
});

test("follow-up tool guides the agent without recording answers or exposing notes", async () => {
  const activities: WebMcpActivity[] = [];
  const pendingQuestions = [{
    id: "question_followup_stage", domain: "stage" as const, registryField: "eligibility criteria",
    questionEn: "What cancer stage is documented?", questionZhHant: "病歷記載的癌症分期為何？",
    reasonEn: "The public criteria mention stage.", reasonZhHant: "公開條件提到分期。", trialCount: 3,
  }];
  const tool = buildTrialBridgeTools({ profile, matches: [], pendingQuestions, sensitiveConsent: true, onActivity: (activity) => activities.push(activity) }).find((candidate) => candidate.name === "review_trial_followups");
  assert.ok(tool);
  const output = await tool.execute({ language: "en" }, { signal: new AbortController().signal });
  assert.deepEqual(activities, [
    { toolName: "review_trial_followups", state: "running" },
    { toolName: "review_trial_followups", state: "completed" },
  ]);
  assert.match(JSON.stringify(output), /needs_user_input/);
  assert.match(JSON.stringify(output), /visible form/);
  assert.doesNotMatch(JSON.stringify(output), /gastric cancer|rawText|maskedText|answer\s*:/i);
});

test("follow-up tool returns an actionable recovery state when matching is still running", async () => {
  const tool = buildTrialBridgeTools({ profile, matches: [], matching: true, sensitiveConsent: true }).find((candidate) => candidate.name === "review_trial_followups");
  assert.ok(tool);
  const output = await tool.execute({ language: "en" }, { signal: new AbortController().signal });
  assert.deepEqual(output, { state: "matching_in_progress", nextAction: "Wait for the current registry comparison, then call this tool again." });
});

test("six localized follow-up questions remain structured within the WebMCP output budget", async () => {
  const pendingQuestions = Array.from({ length: 6 }, (_, index) => ({
    id: `question_followup_${index}`, domain: "organ_function" as const, registryField: "eligibility criteria",
    questionEn: "Are recent blood counts, kidney, liver, or heart-function results available?",
    questionZhHant: "是否有近期血球、腎臟、肝臟或心臟功能結果？",
    reasonEn: "The public criteria mention laboratory or organ-function requirements.",
    reasonZhHant: "公開條件提到檢驗或器官功能要求。", trialCount: 12 - index,
  }));
  const tool = buildTrialBridgeTools({ profile, matches: [], pendingQuestions, sensitiveConsent: true }).find((candidate) => candidate.name === "review_trial_followups");
  assert.ok(tool);
  const output = await tool.execute({ language: "en" }, { signal: new AbortController().signal });
  assert.equal(JSON.stringify(output).length <= maxWebMcpOutputChars, true);
  assert.equal(Object.hasOwn(output as object, "truncated"), false);
  assert.equal((output as { questions: unknown[] }).questions.length, 6);
});

test("invalid contextual tool calls return recovery guidance instead of raw errors", () => {
  const tools = buildTrialBridgeTools({ profile, matches: [], sensitiveConsent: true });
  const outreachTool = tools.find((candidate) => candidate.name === "draft_trial_outreach");
  const followUpTool = tools.find((candidate) => candidate.name === "review_trial_followups");
  assert.ok(outreachTool);
  assert.ok(followUpTool);
  assert.throws(() => outreachTool.execute({ trialId: "missing", language: "en" }, { signal: new AbortController().signal }), /use explain_confirmed_matches.*then call again/i);
  assert.throws(() => followUpTool.execute({ language: "fr" }, { signal: new AbortController().signal }), /zh-Hant or en.*call this tool again/i);
});

test("WebMCP output is bounded before it returns to an agent", () => {
  const output = capWebMcpOutput({ content: "x".repeat(maxWebMcpOutputChars * 2) });
  assert.equal(typeof output, "object");
  assert.equal(JSON.stringify(output).length <= maxWebMcpOutputChars + 32, true);
  assert.equal((output as { truncated?: boolean }).truncated, true);
});
