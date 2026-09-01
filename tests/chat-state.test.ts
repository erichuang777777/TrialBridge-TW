import assert from "node:assert/strict";
import test from "node:test";
import { chatReducer, initialChatState } from "../lib/chat/state.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";

const draft = profileDraftSchema.parse({
  schemaVersion: "1.0", language: "zh-Hant", subjectRole: "patient",
  facts: [{ id: "fact_cancer_1", domain: "cancer_type", value: "gastric cancer", displayZhHant: "胃癌", displayEn: "Gastric cancer", source: "masked_note", confidence: 0.9, confirmed: false }],
  missingQuestions: [], safetyNote: "待本人確認，不是醫療建議或資格判定。",
});

test("English is the first-display language", () => {
  assert.equal(initialChatState.language, "en");
});

test("chat state cannot skip privacy, masking, extraction, or confirmation", () => {
  assert.equal(chatReducer(initialChatState, { type: "ACCEPT_PRIVACY" }).stage, "role");
  const role = chatReducer(initialChatState, { type: "SELECT_ROLE", role: "patient" });
  const capture = chatReducer(role, { type: "ACCEPT_PRIVACY" });
  assert.equal(chatReducer(capture, { type: "EXTRACTION_START" }).stage, "capture");
  assert.equal(chatReducer(capture, { type: "EXTRACTION_SUCCESS", draft }).stage, "capture");
});

test("raw text is discarded when consented cloud extraction begins", () => {
  let state = chatReducer(initialChatState, { type: "SELECT_ROLE", role: "patient" });
  state = chatReducer(state, { type: "ACCEPT_PRIVACY" });
  state = chatReducer(state, { type: "SET_RAW_TEXT", value: "synthetic medical text long enough" });
  state = chatReducer(state, { type: "MASK_COMPLETE", result: { maskedText: "synthetic medical text long enough", findings: [] } });
  state = chatReducer(state, { type: "EXTRACTION_START" });
  assert.equal(state.stage, "extracting");
  assert.equal(state.rawText, "");
  state = chatReducer(state, { type: "EXTRACTION_SUCCESS", draft });
  assert.equal(state.stage, "confirmation");
  const profile = confirmProfile(draft, {}, "patient", "2026-09-01T00:00:00.000Z");
  state = chatReducer(state, { type: "CONFIRM_SUCCESS", profile });
  assert.equal(state.stage, "ready");
  assert.equal(state.draft, undefined);
  assert.equal(state.maskResult, undefined);
});

test("a cancelled extraction returns to the masked review", () => {
  let state = chatReducer(initialChatState, { type: "SELECT_ROLE", role: "patient" });
  state = chatReducer(state, { type: "ACCEPT_PRIVACY" });
  state = chatReducer(state, { type: "SET_RAW_TEXT", value: "synthetic medical text long enough" });
  state = chatReducer(state, { type: "MASK_COMPLETE", result: { maskedText: "synthetic medical text long enough", findings: [] } });
  state = chatReducer(state, { type: "EXTRACTION_START" });
  state = chatReducer(state, { type: "EXTRACTION_CANCEL" });
  assert.equal(state.stage, "mask_review");
  assert.equal(state.maskResult?.maskedText, "synthetic medical text long enough");
});

test("summary confirmation can return to the masked note on the same review flow", () => {
  const confirmation = {
    stage: "confirmation" as const, language: "en" as const, subjectRole: "patient" as const, rawText: "",
    maskResult: { maskedText: "masked synthetic note", findings: [] }, draft,
  };
  const capture = chatReducer(confirmation, { type: "BACK_TO_CAPTURE" });
  assert.equal(capture.stage, "capture");
  assert.equal(capture.rawText, "masked synthetic note");
  assert.equal(capture.draft, undefined);
});

test("reset clears anonymous session data but keeps language preference in memory", () => {
  const english = chatReducer(initialChatState, { type: "SET_LANGUAGE", language: "en" });
  const role = chatReducer(english, { type: "SELECT_ROLE", role: "caregiver" });
  const reset = chatReducer(role, { type: "RESET" });
  assert.deepEqual(reset, { stage: "role", language: "en", rawText: "" });
});

test("development stage jumps are ignored outside development", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = mutableEnv.NODE_ENV;
  mutableEnv.NODE_ENV = "production";
  try {
    const attemptedJump = chatReducer(initialChatState, {
      type: "DEV_SET_STATE",
      state: { stage: "capture", language: "en", rawText: "synthetic fixture" },
    });
    assert.deepEqual(attemptedJump, initialChatState);
  } finally {
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previousNodeEnv;
  }
});
