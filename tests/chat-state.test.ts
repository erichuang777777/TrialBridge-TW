import assert from "node:assert/strict";
import test from "node:test";
import { chatReducer, initialChatState, isSyntheticDemoValue, removeSyntheticDemoSearch, syntheticCompetitionNote } from "../lib/chat/state.ts";
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
  assert.equal(chatReducer(initialChatState, { type: "ACCEPT_PRIVACY" }).stage, "mode");
  const privacy = chatReducer(initialChatState, { type: "START_INTAKE" });
  const capture = chatReducer(privacy, { type: "ACCEPT_PRIVACY" });
  assert.equal(chatReducer(capture, { type: "EXTRACTION_START" }).stage, "capture");
  assert.equal(chatReducer(capture, { type: "EXTRACTION_SUCCESS", draft }).stage, "capture");
});

test("raw text is discarded when the visible cloud-organization action begins", () => {
  let state = chatReducer(initialChatState, { type: "START_INTAKE" });
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
  assert.equal(state.draft, draft);
  assert.equal(state.maskResult?.maskedText, "synthetic medical text long enough");
});

test("a cancelled extraction returns to the masked review", () => {
  let state = chatReducer(initialChatState, { type: "START_INTAKE" });
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

test("starting intake uses a neutral default without a patient-caregiver question", () => {
  const state = chatReducer(initialChatState, { type: "START_INTAKE" });
  assert.equal(state.stage, "privacy");
  assert.equal(state.subjectRole, "patient");
});

test("synthetic competition entry prefills fiction but cannot bypass the protected workflow", () => {
  const privacy = chatReducer(initialChatState, { type: "START_SYNTHETIC_DEMO" });
  assert.equal(privacy.stage, "privacy");
  assert.equal(privacy.rawText, syntheticCompetitionNote);
  assert.match(privacy.rawText, /no real patient data/i);
  assert.equal(chatReducer(privacy, { type: "EXTRACTION_START" }).stage, "privacy");
});

test("the synthetic judge deep link carries no note and can be cleared without losing other URL state", () => {
  assert.equal(isSyntheticDemoValue("synthetic"), true);
  assert.equal(isSyntheticDemoValue("patient-note"), false);
  assert.equal(isSyntheticDemoValue(["synthetic"]), false);
  assert.equal(isSyntheticDemoValue(undefined), false);
  assert.equal(removeSyntheticDemoSearch("?demo=synthetic&lang=en"), "?lang=en");
  assert.equal(removeSyntheticDemoSearch("?demo=patient-note&lang=en"), "?demo=patient-note&lang=en");
});

test("reset clears anonymous session data but keeps language preference in memory", () => {
  const english = chatReducer(initialChatState, { type: "SET_LANGUAGE", language: "en" });
  const privacy = chatReducer(english, { type: "START_INTAKE" });
  const reset = chatReducer(privacy, { type: "RESET" });
  assert.deepEqual(reset, { stage: "mode", language: "en", subjectRole: "patient", rawText: "" });
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
