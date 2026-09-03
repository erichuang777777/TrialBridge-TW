import assert from "node:assert/strict";
import test from "node:test";
import { cloudExtractionRequestSchema, extractProfileInCloud } from "../lib/llm/extraction.ts";
import { validatedLoopbackBaseUrl } from "../lib/llm/ollama.ts";
import { maskDirectIdentifiers, hasDirectIdentifiers } from "../lib/privacy/mask.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";

const draftFixture = profileDraftSchema.parse({
  schemaVersion: "1.0",
  language: "en",
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
    reason: "The stage was not stated.",
  }],
  safetyNote: "Draft, not medical advice or a final eligibility decision.",
});

test("browser masking removes common direct identifiers without retaining their values", () => {
  const source = [
    "姓名：王小明", "身分證 A123456789", "電話 0912-345-678", "Email patient@example.com",
    "病歷號：MR-998877", "出生日期：1980/03/04", "診斷胃癌。",
  ].join("\n");
  const result = maskDirectIdentifiers(source);
  for (const forbidden of ["王小明", "A123456789", "0912-345-678", "patient@example.com", "MR-998877", "1980/03/04"]) {
    assert.equal(result.maskedText.includes(forbidden), false);
    assert.equal(JSON.stringify(result.findings).includes(forbidden), false);
  }
  assert.match(result.maskedText, /診斷胃癌/);
  assert.equal(hasDirectIdentifiers(result.maskedText), false);
});

test("cloud extraction requires explicit approval and loopback proxy configuration", () => {
  assert.equal(cloudExtractionRequestSchema.safeParse({
    maskedText: "Synthetic masked oncology note long enough.", subjectRole: "patient", language: "en",
  }).success, false);
  assert.equal(validatedLoopbackBaseUrl("http://localhost:11434").hostname, "localhost");
  assert.throws(() => validatedLoopbackBaseUrl("https://example.com"), /loopback/);
});

test("cloud extraction uses only gpt-oss:120b-cloud and validates its draft", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const mockFetch: typeof fetch = async (input, init) => {
    assert.equal(new URL(input.toString()).hostname, "127.0.0.1");
    requestBody = JSON.parse(String(init?.body));
    return Response.json({ model: "gpt-oss:120b", message: { content: JSON.stringify(draftFixture) }, done_reason: "stop" });
  };
  const result = await extractProfileInCloud({
    maskedText: "[MASKED_NAME_1] was diagnosed with gastric adenocarcinoma.",
    subjectRole: "patient",
    language: "en",
    cloudUseApproved: true,
  }, mockFetch);
  assert.equal(result.remote, true);
  assert.equal(result.model, "gpt-oss:120b-cloud");
  assert.equal(result.reportedModel, "gpt-oss:120b");
  assert.equal(result.draft.facts[0].confirmed, false);
  assert.equal(requestBody?.model, "gpt-oss:120b-cloud");
  assert.equal(requestBody?.think, false);
  assert.equal(requestBody?.format, "json");
  assert.equal(requestBody?.stream, true);
  assert.deepEqual((requestBody?.options as { num_predict: number }).num_predict, 3072);
  assert.equal(result.transport, "localhost_ollama_proxy");
});

test("cloud extraction assembles streamed Ollama chunks and reports only character counts", async () => {
  const content = JSON.stringify(draftFixture);
  const chunks = [content.slice(0, 40), content.slice(40, 90), content.slice(90)];
  const lines = chunks.map((piece, index) => JSON.stringify(index === chunks.length - 1
    ? { model: "gpt-oss:120b", message: { content: piece }, done: true, done_reason: "stop" }
    : { model: "gpt-oss:120b", message: { content: piece }, done: false }));
  const mockFetch: typeof fetch = async () => new Response(new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
      controller.close();
    },
  }), { headers: { "Content-Type": "application/x-ndjson" } });
  const progress: number[] = [];
  const result = await extractProfileInCloud({
    maskedText: "Synthetic masked oncology note long enough for this test.",
    subjectRole: "patient",
    language: "en",
    cloudUseApproved: true,
  }, mockFetch, undefined, { onProgress: (update) => progress.push(update.characters) });
  assert.equal(result.draft.facts[0].domain, "cancer_type");
  assert.deepEqual(progress, [40, 90, content.length]);
});

test("an Ollama API key switches every model call to the HTTPS cloud API with a bearer header", async () => {
  const previous = { key: process.env.OLLAMA_API_KEY, base: process.env.OLLAMA_BASE_URL };
  process.env.OLLAMA_API_KEY = "test-cloud-api-key-0123456789";
  delete process.env.OLLAMA_BASE_URL;
  try {
    let seenUrl = "";
    let seenAuthorization: string | null = null;
    let requestBody: Record<string, unknown> | undefined;
    const mockFetch: typeof fetch = async (input, init) => {
      seenUrl = input.toString();
      seenAuthorization = new Headers(init?.headers).get("authorization");
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ model: "gpt-oss:120b", message: { content: JSON.stringify(draftFixture) }, done_reason: "stop" });
    };
    const result = await extractProfileInCloud({
      maskedText: "Synthetic masked oncology note long enough for this test.",
      subjectRole: "patient",
      language: "en",
      cloudUseApproved: true,
    }, mockFetch);
    assert.equal(seenUrl, "https://ollama.com/api/chat");
    assert.equal(seenAuthorization, "Bearer test-cloud-api-key-0123456789");
    assert.equal(requestBody?.model, "gpt-oss:120b");
    assert.equal(result.model, "gpt-oss:120b");
    assert.equal(result.transport, "ollama_cloud_api");
  } finally {
    if (previous.key === undefined) delete process.env.OLLAMA_API_KEY; else process.env.OLLAMA_API_KEY = previous.key;
    if (previous.base === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = previous.base;
  }
});

test("cloud extraction tolerates an omitted provider model label", async () => {
  const mockFetch: typeof fetch = async () => Response.json({ message: { content: JSON.stringify(draftFixture) }, done_reason: "stop" });
  const result = await extractProfileInCloud({
    maskedText: "Synthetic masked oncology note long enough for this test.",
    subjectRole: "patient",
    language: "en",
    cloudUseApproved: true,
  }, mockFetch);
  assert.equal(result.reportedModel, null);
});

test("a truncated cloud response is classified for safe retry", async () => {
  const mockFetch: typeof fetch = async () => Response.json({ message: { content: "{\"facts\":[" }, done_reason: "length" });
  await assert.rejects(() => extractProfileInCloud({
    maskedText: "Synthetic masked oncology note long enough for this test.",
    subjectRole: "patient",
    language: "en",
    cloudUseApproved: true,
  }, mockFetch), (error: unknown) => error instanceof Error && "code" in error && error.code === "CLOUD_OUTPUT_TRUNCATED");
});

test("confirmation creates a distinct patient-confirmed profile and keeps dialogue consent disabled", () => {
  const confirmed = confirmProfile(draftFixture, {}, "patient", "2026-09-01T01:02:03.000Z");
  assert.equal(draftFixture.facts[0].confirmed, false);
  assert.equal(confirmed.facts[0].confirmed, true);
  assert.equal(confirmed.cloudUseApproved, false);
});
