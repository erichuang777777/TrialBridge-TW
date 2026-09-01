import assert from "node:assert/strict";
import test from "node:test";
import { answerConfirmedDialogue, cloudDialogueRequestSchema, validatedCloudModel } from "../lib/llm/cloud.ts";
import { confirmProfile, profileDraftSchema, setCloudUseApproval } from "../lib/profile/schema.ts";

const draft = profileDraftSchema.parse({ schemaVersion: "1.0", language: "zh-Hant", subjectRole: "patient", facts: [{ id: "fact_cancer_1", domain: "cancer_type", value: "gastric cancer", displayZhHant: "胃癌", displayEn: "Gastric cancer", source: "user_statement", confidence: 1, confirmed: false }], missingQuestions: [], safetyNote: "Draft, not advice." });
const confirmed = confirmProfile(draft, {}, "patient", "2026-09-01T00:00:00.000Z");

test("cloud dialogue requires separate approval and the required gpt-oss model", () => {
  assert.equal(cloudDialogueRequestSchema.safeParse({ profile: confirmed, question: "請解釋", trials: [], language: "zh-Hant" }).success, false);
  assert.equal(validatedCloudModel(), "gpt-oss:120b-cloud");
  assert.throws(() => validatedCloudModel("qwen3.5:cloud"), /gpt-oss:120b-cloud/);
});

test("cloud dialogue sends only minimized confirmed facts", async () => {
  let sent = "";
  const approved = setCloudUseApproval(confirmed, true);
  const mockFetch: typeof fetch = async (_input, init) => { sent = String(init?.body); return Response.json({ message: { content: "請向試驗團隊確認完整條件。" } }); };
  const result = await answerConfirmedDialogue({ profile: approved, question: "這代表什麼？", trials: [], language: "zh-Hant" }, mockFetch);
  assert.equal(result.persisted, false);
  assert.equal(sent.includes("gastric cancer"), true);
  assert.equal(sent.includes('"think":false'), true);
  assert.equal(sent.includes("displayZhHant"), false);
  assert.equal(sent.includes("confirmedAt"), false);
});

test("cloud dialogue receives only visible shortlist flags and is told not to infer selections", async () => {
  let sent = "";
  const approved = setCloudUseApproval(confirmed, true);
  const trials = [
    { registryId: "NCT00000001", title: "Synthetic trial one", status: "needs_review", sourceUrl: "https://clinicaltrials.gov/study/NCT00000001", shortlisted: true },
    { registryId: "NCT00000002", title: "Synthetic trial two", status: "needs_information", sourceUrl: "https://clinicaltrials.gov/study/NCT00000002", shortlisted: false },
  ];
  const mockFetch: typeof fetch = async (_input, init) => { sent = String(init?.body); return Response.json({ message: { content: "Select one more trial before comparing the shortlist." } }); };
  await answerConfirmedDialogue({ profile: approved, question: "Compare my shortlist", trials, language: "en" }, mockFetch);
  const request = JSON.parse(sent) as { messages: Array<{ role: string; content: string }> };
  const system = request.messages.find((message) => message.role === "system")?.content ?? "";
  const context = JSON.parse(request.messages.find((message) => message.role === "user")?.content ?? "{}") as { publicTrials: Array<{ shortlisted: boolean }> };
  assert.match(system, /shortlisted=true/);
  assert.match(system, /fewer than two are marked/);
  assert.deepEqual(context.publicTrials.map((trial) => trial.shortlisted), [true, false]);
  assert.doesNotMatch(JSON.stringify(context), /displayEn|confirmedAt/);
});
