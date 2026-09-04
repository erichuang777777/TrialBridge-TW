/// <reference types="webmcp-types" />
import assert from "node:assert/strict";
import test from "node:test";
import { buildTrialBridgeTools } from "../lib/webmcp/tools.ts";
import { capWebMcpOutput, maxWebMcpOutputChars } from "../lib/webmcp/output.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";
import type { WebMcpActivity, WebMcpExecutionControlEvent } from "../lib/webmcp/tools.ts";
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
    detailedCriteria: [],
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

test("public WebMCP search returns the visible bilingual registry query plan", async () => {
  const fetcher = (async () => new Response(JSON.stringify({
    trials: [],
    queryPlan: {
      strategy: "curated_bilingual_cancer_lexicon",
      canonicalGroup: "gastric",
      dictionaryVersion: "2026-09-02",
      registryConditions: { TFDA: "胃癌", "ClinicalTrials.gov": "gastric cancer" },
    },
    sources: [{ registry: "TFDA", count: 0, retrievedAt: "2026-09-02T00:00:00.000Z", durationMs: 75 }],
    failures: [{ registry: "ClinicalTrials.gov", message: "Source did not respond within 20 s", code: "SOURCE_TIMEOUT", durationMs: 20_000 }],
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  const tool = buildTrialBridgeTools({ matches: [], sensitiveConsent: false, fetcher }).find((candidate) => candidate.name === "search_public_cancer_trials");
  assert.ok(tool);
  const output = await tool.execute({ condition: "胃癌" }, { signal: new AbortController().signal }) as {
    queryPlan: { registryConditions: Record<string, string> };
    completeness: string;
    sourceStatus: { completed: Array<{ registry: string; count: number; retrievedAt: string; durationMs?: number }>; failed: Array<{ registry: string; message: string; code?: string; durationMs?: number }> };
    records: unknown[];
  };
  assert.deepEqual(output.queryPlan.registryConditions, { TFDA: "胃癌", "ClinicalTrials.gov": "gastric cancer" });
  assert.equal(output.completeness, "partial");
  assert.deepEqual(output.sourceStatus, {
    completed: [{ registry: "TFDA", count: 0, retrievedAt: "2026-09-02T00:00:00.000Z", durationMs: 75 }],
    failed: [{ registry: "ClinicalTrials.gov", message: "Source did not respond within 20 s", code: "SOURCE_TIMEOUT", durationMs: 20_000 }],
  });
  assert.deepEqual(output.records, []);
});

test("public WebMCP search preserves structured source failures when every registry is unavailable", async () => {
  const fetcher = (async () => Response.json({
    trials: [],
    failures: [
      { registry: "TFDA", message: "Source unavailable", code: "SOURCE_UNAVAILABLE", durationMs: 120 },
      { registry: "ClinicalTrials.gov", message: "Source did not respond within 20 s", code: "SOURCE_TIMEOUT", durationMs: 20_000 },
    ],
  }, { status: 503 })) as typeof fetch;
  const tool = buildTrialBridgeTools({ matches: [], sensitiveConsent: false, fetcher }).find((candidate) => candidate.name === "search_public_cancer_trials");
  assert.ok(tool);
  const output = await tool.execute({ condition: "gastric cancer" }, { signal: new AbortController().signal }) as {
    completeness: string;
    sourceStatus: { failed: Array<{ registry: string; code?: string }> };
  };
  assert.equal(output.completeness, "unavailable");
  assert.deepEqual(output.sourceStatus.failed.map((failure) => [failure.registry, failure.code]), [
    ["TFDA", "SOURCE_UNAVAILABLE"],
    ["ClinicalTrials.gov", "SOURCE_TIMEOUT"],
  ]);
});

test("public WebMCP cancellation reaches fetch and records a cancelled activity", async () => {
  const activities: WebMcpActivity[] = [];
  let observedSignal: AbortSignal | null | undefined;
  const fetcher = ((async (_input: string | URL | Request, init?: RequestInit) => {
    observedSignal = init?.signal;
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
  }) as unknown) as typeof fetch;
  const controller = new AbortController();
  const reason = new DOMException("Synthetic agent cancellation", "AbortError");
  const tool = buildTrialBridgeTools({ matches: [], sensitiveConsent: false, fetcher, onActivity: (activity) => activities.push(activity) }).find((candidate) => candidate.name === "search_public_cancer_trials");
  assert.ok(tool);
  const pending = Promise.resolve(tool.execute({ condition: "gastric cancer" }, { signal: controller.signal }));
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort(reason);
  await assert.rejects(pending, (error: unknown) => error === reason);
  assert.equal(observedSignal, controller.signal);
  assert.deepEqual(activities, [
    { toolName: "search_public_cancer_trials", state: "running" },
    { toolName: "search_public_cancer_trials", state: "cancelled" },
  ]);
});

test("visible human cancellation aborts the active WebMCP fetch and clears its control", async () => {
  const activities: WebMcpActivity[] = [];
  const controlEvents: WebMcpExecutionControlEvent[] = [];
  let observedSignal: AbortSignal | null | undefined;
  const fetcher = ((async (_input: string | URL | Request, init?: RequestInit) => {
    observedSignal = init?.signal;
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
  }) as unknown) as typeof fetch;
  const agentController = new AbortController();
  const tool = buildTrialBridgeTools({
    matches: [],
    sensitiveConsent: false,
    fetcher,
    onActivity: (activity) => activities.push(activity),
    onExecutionControl: (event) => controlEvents.push(event),
  }).find((candidate) => candidate.name === "search_public_cancer_trials");
  assert.ok(tool);
  const pending = Promise.resolve(tool.execute({ condition: "gastric cancer" }, { signal: agentController.signal }));
  await new Promise((resolve) => setImmediate(resolve));
  const available = controlEvents.find((event) => event.type === "available");
  assert.ok(available);
  available.control.cancel();
  await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  assert.notEqual(observedSignal, agentController.signal);
  assert.equal(observedSignal?.aborted, true);
  assert.equal(agentController.signal.aborted, false);
  assert.deepEqual(activities, [
    { toolName: "search_public_cancer_trials", state: "running" },
    { toolName: "search_public_cancer_trials", state: "cancelled" },
  ]);
  assert.deepEqual(controlEvents.map((event) => event.type), ["available", "cleared"]);
  const cleared = controlEvents.at(-1);
  assert.ok(cleared?.type === "cleared");
  assert.equal(cleared.executionId, available.control.executionId);
});

test("completed WebMCP execution clears the visible cancellation control", async () => {
  const controlEvents: WebMcpExecutionControlEvent[] = [];
  const tool = buildTrialBridgeTools({
    matches: [],
    sensitiveConsent: false,
    onExecutionControl: (event) => controlEvents.push(event),
  }).find((candidate) => candidate.name === "trialbridge_method");
  assert.ok(tool);
  await tool.execute({}, { signal: new AbortController().signal });
  assert.deepEqual(controlEvents.map((event) => event.type), ["available", "cleared"]);
  const available = controlEvents[0];
  const cleared = controlEvents[1];
  assert.equal(available.type === "available" && cleared.type === "cleared" && available.control.executionId, cleared.type === "cleared" ? cleared.executionId : -1);
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

test("the intake tool registers only behind the visible switch, rejects identifiers, and reports the note step's outcome", async () => {
  const intakeName = "organize_deidentified_summary";
  assert.equal(buildTrialBridgeTools({ matches: [], sensitiveConsent: false }).some((tool) => tool.name === intakeName), false);
  assert.equal(buildTrialBridgeTools({ profile, matches: [], sensitiveConsent: true, agentIntake: { submit: async () => ({ state: "organizing" }) } }).some((tool) => tool.name === intakeName), false, "never alongside a confirmed profile");

  const received: string[] = [];
  const tools = buildTrialBridgeTools({
    matches: [],
    sensitiveConsent: false,
    agentIntake: {
      submit: async ({ summary }) => {
        received.push(summary);
        return { state: "awaiting_confirmation", extractedFacts: 4, pendingQuestions: 1 };
      },
    },
  });
  assert.deepEqual(tools.map((tool) => tool.name), ["trialbridge_method", "search_public_cancer_trials", intakeName]);
  const tool = tools[2]!;
  assert.equal(tool.annotations?.readOnlyHint, false);
  const signal = new AbortController().signal;
  const summary = "Stage IV gastric adenocarcinoma, HER2 negative, prior FOLFOX, age 62, can travel within Taiwan and Asia.";

  await assert.rejects(() => Promise.resolve(tool.execute({ summary: "too short" }, { signal })), /20-4000 characters/);
  await assert.rejects(() => Promise.resolve(tool.execute({ summary: `${summary} Contact me at person@example.com or 0912-345-678.` }, { signal })), /Remove these direct identifiers and call again: email, phone/);
  assert.deepEqual(received, [], "nothing with an identifier reaches the page");

  // Chrome's current Origin Trial delivers executeTool input as a JSON string.
  const output = await tool.execute(JSON.stringify({ summary }) as unknown as Record<string, unknown>, { signal }) as Record<string, unknown>;
  assert.deepEqual(received, [summary]);
  assert.equal(output.state, "awaiting_confirmation");
  assert.equal(output.extractedFacts, 4);
  assert.equal(output.acceptedCharacters, summary.length);
  assert.match(String(output.nextAction), /confirm each extracted fact/);
  assert.doesNotMatch(JSON.stringify(output), /gastric|FOLFOX/, "the summary text itself is never echoed back");
});

test("the intake tool answers 'organizing' when the visible step outlives its wait budget", async () => {
  let resolveSubmit: (() => void) | undefined;
  const tool = buildTrialBridgeTools({
    matches: [],
    sensitiveConsent: false,
    agentIntake: { waitMs: 30, submit: () => new Promise((resolve) => { resolveSubmit = () => resolve({ state: "failed", reason: "late" }); }) },
  }).find((candidate) => candidate.name === "organize_deidentified_summary");
  assert.ok(tool);
  const output = await tool.execute({ summary: "Stage II breast cancer, ER positive, HER2 negative, after surgery, age band 50s, Taiwan only." }, { signal: new AbortController().signal }) as Record<string, unknown>;
  assert.equal(output.state, "organizing");
  assert.match(String(output.nextAction), /still running/);
  resolveSubmit?.();
});
