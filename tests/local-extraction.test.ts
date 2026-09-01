import assert from "node:assert/strict";
import test from "node:test";
import {
  extractProfileLocally,
  validatedCpuFallbackModel,
  validatedLocalModel,
  validatedLoopbackBaseUrl,
} from "../lib/llm/ollama.ts";
import { maskDirectIdentifiers, hasDirectIdentifiers } from "../lib/privacy/mask.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";

const draftFixture = profileDraftSchema.parse({
  schemaVersion: "1.0",
  language: "zh-Hant",
  subjectRole: "patient",
  facts: [{
    id: "fact_cancer_type",
    domain: "cancer_type",
    value: "gastric adenocarcinoma",
    displayZhHant: "胃腺癌",
    displayEn: "Gastric adenocarcinoma",
    source: "masked_note",
    confidence: 0.9,
    confirmed: false,
  }],
  missingQuestions: [{
    id: "question_stage",
    domain: "stage",
    questionZhHant: "目前分期為何？",
    questionEn: "What is the current stage?",
    reason: "原文沒有明確分期。",
  }],
  safetyNote: "這是待確認草稿，不是醫療建議或最終試驗資格判定。",
});

test("browser masking removes common direct identifiers without retaining their values", () => {
  const source = [
    "姓名：王小明",
    "身分證 A123456789",
    "電話 0912-345-678",
    "Email patient@example.com",
    "病歷號：MR-998877",
    "出生日期：1980/03/04",
    "診斷胃癌。",
  ].join("\n");
  const result = maskDirectIdentifiers(source);
  for (const forbidden of ["王小明", "A123456789", "0912-345-678", "patient@example.com", "MR-998877", "1980/03/04"]) {
    assert.equal(result.maskedText.includes(forbidden), false);
    assert.equal(JSON.stringify(result.findings).includes(forbidden), false);
  }
  assert.match(result.maskedText, /診斷胃癌/);
  assert.equal(result.findings.length, 6);
  assert.equal(hasDirectIdentifiers(result.maskedText), false);
});

test("server-side identifier detector rejects unmasked content", () => {
  assert.equal(hasDirectIdentifiers("請聯絡 patient@example.com，診斷為胃癌"), true);
  assert.equal(hasDirectIdentifiers("請聯絡 [MASKED_EMAIL_1]，診斷為胃癌"), false);
});

test("Ollama endpoint is loopback-only and cloud extraction models are forbidden", () => {
  assert.equal(validatedLoopbackBaseUrl("http://localhost:11434").hostname, "localhost");
  assert.throws(() => validatedLoopbackBaseUrl("https://example.com"), /loopback/);
  assert.throws(() => validatedLoopbackBaseUrl("http://192.168.1.10:11434"), /loopback/);
  assert.equal(validatedLocalModel("medgemma:4b"), "medgemma:4b");
  assert.equal(validatedLocalModel(), "medgemma:4b");
  assert.equal(validatedCpuFallbackModel(), "medgemma-cpu:latest");
  assert.throws(() => validatedLocalModel("qwen3.5:cloud"), /forbidden/);
  assert.throws(() => validatedLocalModel("gpt-oss:120b-cloud"), /forbidden/);
});

test("local extraction sends only masked text and validates the returned draft", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const mockFetch: typeof fetch = async (input, init) => {
    assert.equal(new URL(input.toString()).hostname, "127.0.0.1");
    requestBody = JSON.parse(String(init?.body));
    return Response.json({ message: { content: JSON.stringify(draftFixture) } });
  };
  const draft = await extractProfileLocally({
    maskedText: "[MASKED_NAME_1] was diagnosed with gastric adenocarcinoma.",
    subjectRole: "patient",
    language: "zh-Hant",
  }, mockFetch);
  assert.equal(draft.facts[0].confirmed, false);
  assert.equal(requestBody?.format, "json");
  assert.equal(requestBody?.model, "medgemma:4b");
  const messages = requestBody?.messages as Array<{ role: string; content: string }>;
  assert.equal(messages.at(-1)?.content.includes("[MASKED_NAME_1]"), true);
  assert.equal(JSON.stringify(requestBody).includes("patient@example.com"), false);
});

test("confirmation creates a distinct patient-confirmed profile and keeps cloud disabled", () => {
  const confirmed = confirmProfile(draftFixture, {
    fact_cancer_type: {
      value: "gastric adenocarcinoma",
      displayZhHant: "胃腺癌（本人確認）",
      displayEn: "Gastric adenocarcinoma (confirmed)",
    },
  }, "patient", "2026-09-01T01:02:03.000Z");
  assert.equal(draftFixture.facts[0].confirmed, false);
  assert.equal(confirmed.facts[0].confirmed, true);
  assert.equal(confirmed.facts[0].confirmedAt, "2026-09-01T01:02:03.000Z");
  assert.equal(confirmed.cloudUseApproved, false);
});
