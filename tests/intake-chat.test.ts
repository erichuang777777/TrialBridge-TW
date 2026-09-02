import assert from "node:assert/strict";
import test from "node:test";
import { answerGuidedIntake, guidedIntakeRequestSchema } from "../lib/llm/intake.ts";

const base = {
  stage: "capture" as const,
  language: "en" as const,
  maskedMessage: "The diagnosis is gastric cancer and the stage is unknown.",
  context: { confirmedDomains: [], hasResults: false, allFactsConfirmed: false, allFollowUpsAnswered: false },
};

test("guided intake rejects unmasked direct identifiers", () => {
  assert.equal(guidedIntakeRequestSchema.safeParse({ ...base, maskedMessage: "My phone is 0912-345-678" }).success, false);
});

test("guided intake has no patient-caregiver role field", () => {
  assert.equal(guidedIntakeRequestSchema.safeParse({
    ...base,
    context: { ...base.context, subjectRole: "patient" },
  }).success, false);
});

test("guided intake uses only the required cloud model and returns a bounded workflow action", async () => {
  let sent = "";
  const mockFetch: typeof fetch = async (_input, init) => {
    sent = String(init?.body);
    return Response.json({ message: { content: JSON.stringify({ reply: "I added that to the note. What treatments have been given?", workflowAction: "append_medical_note" }) } });
  };
  const result = await answerGuidedIntake(base, mockFetch);
  assert.equal(result.workflowAction, "append_medical_note");
  assert.equal(result.persisted, false);
  assert.match(sent, /gpt-oss:120b-cloud/);
  assert.match(sent, /"think":false/);
  assert.match(sent, /"format":"json"/);
  assert.doesNotMatch(sent, /"subjectRole"/);
});

test("guided intake suppresses model-generated patient or caregiver gates", async () => {
  for (const reply of [
    "Are you the patient or a caregiver?",
    "Are you a care giver or the patient?",
    "請問您是病人還是家屬？",
  ]) {
    const mockFetch: typeof fetch = async () => Response.json({
      message: { content: JSON.stringify({ reply, workflowAction: "append_medical_note" }) },
    });
    const result = await answerGuidedIntake(base, mockFetch);
    assert.equal(result.workflowAction, "none");
    assert.doesNotMatch(result.reply, /patient|care\s*giver|病人|家屬/i);
  }
});
