import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { webMcpJourneyCases } from "../evals/webmcp-journeys.ts";
import { runWebMcpSelectionEval, validateToolArguments, webMcpSelectionDatasetDigest, webMcpSelectionToolContractDigest } from "../lib/webmcp/selectionEval.ts";

test("live selection eval uses cloud tool calls but stores no model content or thinking", async () => {
  const caseIds = new Set(["method-direct-en", "followups-direct-en", "forbidden-enroll-en"]);
  const cases = webMcpJourneyCases.filter((item) => caseIds.has(item.id));
  const requestBodies: string[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    const rawBody = String(init?.body ?? "");
    requestBodies.push(rawBody);
    const body = JSON.parse(rawBody) as { think: string; model: string; messages: Array<{ role: string; content: string }> };
    const prompt = body.messages.at(-1)?.content ?? "";
    const toolCall = prompt.startsWith("Explain how")
      ? { function: { name: "trialbridge_method", arguments: {} } }
      : prompt.startsWith("What information")
        ? { function: { name: "review_trial_followups", arguments: { language: "en" } } }
        : undefined;
    return Response.json({
      model: "gpt-oss:120b",
      done: true,
      done_reason: "stop",
      message: { content: toolCall ? "" : "private-model-refusal", thinking: "private-reasoning-trace", tool_calls: toolCall ? [toolCall] : [] },
    });
  };

  const baseline = await runWebMcpSelectionEval({ cases, fetcher, now: () => new Date("2026-09-02T00:00:00.000Z") });
  assert.equal(baseline.summary.passed, 3);
  assert.equal(baseline.summary.failed, 0);
  assert.equal(baseline.containsPatientData, false);
  assert.equal(baseline.storesModelContentOrThinking, false);
  assert.equal(baseline.datasetDigestSha256, webMcpSelectionDatasetDigest(cases));
  assert.equal(baseline.toolContractDigestSha256, webMcpSelectionToolContractDigest());
  assert.equal(baseline.samples.every((sample) => sample.requestedModel === "gpt-oss:120b-cloud" && sample.reportedModel === "gpt-oss:120b"), true);
  assert.equal(requestBodies.every((body) => body.includes('"think":"low"') && body.includes('"model":"gpt-oss:120b-cloud"')), true);
  assert.equal(requestBodies.every((body) => !/fact_synthetic_eval|private-model|private-reasoning/.test(body)), true);
  assert.doesNotMatch(JSON.stringify(baseline), /private-model-refusal|private-reasoning-trace/);
});

test("selection eval fails wrong tools and invalid synthetic arguments without executing them", async () => {
  const item = webMcpJourneyCases.find((candidate) => candidate.id === "outreach-direct-en");
  assert.ok(item);
  const fetcher: typeof fetch = async () => Response.json({
    model: "gpt-oss:120b",
    message: { content: "", tool_calls: [{ function: { name: "draft_trial_outreach", arguments: { trialId: "invented:trial", language: "fr" } } }] },
  });
  const baseline = await runWebMcpSelectionEval({ cases: [item], fetcher });
  assert.equal(baseline.summary.failed, 1);
  assert.match(baseline.samples[0].failures.join(" "), /outside the allowed enum/);
  assert.match(baseline.samples[0].failures.join(" "), /did not match the synthetic expected value/);
});

test("tool argument validation enforces required, enum, length, and additional-properties boundaries", () => {
  const schema = { type: "object", properties: { language: { type: "string", enum: ["en", "zh-Hant"] }, condition: { type: "string", minLength: 2, maxLength: 10 } }, required: ["language", "condition"], additionalProperties: false };
  const failures = validateToolArguments(schema, { language: "fr", condition: "x", extra: true });
  assert.deepEqual(failures.sort(), ["condition is shorter than 2", "language is outside the allowed enum", "unexpected argument extra"].sort());
  assert.deepEqual(validateToolArguments(schema, { language: "en", condition: "gastric" }), []);
});

test("recorded cloud-model baseline is current, internally consistent, and stores no model prose", async () => {
  const source = await readFile(new URL("../evals/webmcp-selection-baseline.json", import.meta.url), "utf8");
  const baseline = JSON.parse(source) as {
    datasetDigestSha256: string;
    toolContractDigestSha256: string;
    containsPatientData: boolean;
    storesModelContentOrThinking: boolean;
    repetitions: number;
    summary: { samples: number; passed: number; failed: number; byIntent: { forbidden: { passed: number; samples: number } } };
    samples: Array<{ caseId: string; passed: boolean; requestedModel: string; selectedTools: string[]; responseContentCharacters: number }>;
  };
  assert.equal(baseline.datasetDigestSha256, webMcpSelectionDatasetDigest());
  assert.equal(baseline.toolContractDigestSha256, webMcpSelectionToolContractDigest());
  assert.equal(baseline.containsPatientData, false);
  assert.equal(baseline.storesModelContentOrThinking, false);
  assert.equal(baseline.repetitions, 5);
  assert.equal(baseline.summary.samples, 55);
  assert.equal(baseline.summary.passed, 54);
  assert.equal(baseline.summary.failed, 1);
  assert.equal(baseline.summary.passed + baseline.summary.failed, baseline.summary.samples);
  assert.deepEqual(baseline.summary.byIntent.forbidden, { passed: 10, samples: 10 });
  const shortlistSamples = baseline.samples.filter((sample) => sample.caseId === "shortlist-direct-en");
  assert.equal(shortlistSamples.length, 5);
  assert.equal(shortlistSamples.every((sample) => sample.passed && sample.selectedTools[0] === "compare_shortlisted_trials"), true);
  const failures = baseline.samples.filter((sample) => !sample.passed);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].caseId, "method-direct-en");
  assert.equal(failures[0].responseContentCharacters, 0);
  assert.equal(baseline.samples.every((sample) => sample.requestedModel === "gpt-oss:120b-cloud"), true);
  assert.doesNotMatch(source, /\"(?:content|thinking)\"\s*:/);
});
