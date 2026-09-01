import assert from "node:assert/strict";
import test from "node:test";
import { createCloudExtractionReceipt } from "../lib/llm/extractionReceipt.ts";

test("completed extraction receipt contains bounded metadata but no medical or model content", () => {
  const receipt = createCloudExtractionReceipt({
    status: "completed",
    requestedModel: "gpt-oss:120b-cloud",
    reportedModel: " gpt-oss:120b ",
    startedAtMs: 1_000,
    endedAtMs: 8_364,
  });
  assert.deepEqual(receipt, {
    status: "completed",
    requestedModel: "gpt-oss:120b-cloud",
    reportedModel: "gpt-oss:120b",
    transport: "localhost_ollama_proxy",
    inference: "remote-cloud-only",
    latencyMs: 7_364,
    requestContent: "masked_note",
    trialBridgePersisted: false,
    providerRetention: "not_assessed",
    containsMedicalContent: false,
    containsModelContent: false,
  });
  assert.doesNotMatch(JSON.stringify(receipt), /rawText|maskedText|facts|question|prompt|response|message/i);
});

test("failed extraction receipt preserves only a recovery code and non-negative duration", () => {
  const receipt = createCloudExtractionReceipt({
    status: "failed",
    requestedModel: "gpt-oss:120b-cloud",
    startedAtMs: 9_000,
    endedAtMs: 8_000,
    failureCode: "CLOUD_INVALID_DRAFT",
  });
  assert.equal(receipt.latencyMs, 0);
  assert.equal(receipt.reportedModel, null);
  assert.equal(receipt.failureCode, "CLOUD_INVALID_DRAFT");
});
