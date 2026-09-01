import assert from "node:assert/strict";
import test from "node:test";
import {
  appendCapabilitySet,
  appendRuntimeState,
  appendToolExecution,
  createWebMcpSessionReceipt,
  maxWebMcpReceiptEvents,
  type WebMcpReceiptEvent,
} from "../lib/webmcp/receipt.ts";

test("capability receipt records verified additions and removals without duplicate sets", () => {
  let events: WebMcpReceiptEvent[] = [];
  events = appendCapabilitySet(events, ["search_public_cancer_trials", "trialbridge_method"], "2026-09-02T01:00:00.000Z", 1);
  events = appendCapabilitySet(events, ["trialbridge_method", "search_public_cancer_trials"], "2026-09-02T01:00:01.000Z", 2);
  assert.equal(events.length, 1);
  events = appendCapabilitySet(events, ["trialbridge_method", "search_public_cancer_trials", "explain_confirmed_matches"], "2026-09-02T01:00:02.000Z", 3);
  events = appendCapabilitySet(events, ["trialbridge_method", "search_public_cancer_trials"], "2026-09-02T01:00:03.000Z", 4);
  assert.deepEqual(events[1].kind === "capability_set" ? events[1].addedToolNames : [], ["explain_confirmed_matches"]);
  assert.deepEqual(events[2].kind === "capability_set" ? events[2].removedToolNames : [], ["explain_confirmed_matches"]);
});

test("session receipt is bounded and contains lifecycle metadata only", () => {
  let events: WebMcpReceiptEvent[] = appendRuntimeState([], "unsupported", "2026-09-02T01:00:00.000Z", 1);
  events = appendRuntimeState(events, "unsupported", "2026-09-02T01:00:01.000Z", 2);
  for (let index = 0; index < maxWebMcpReceiptEvents + 5; index += 1) {
    events = appendToolExecution(events, "trialbridge_method", index % 2 === 0 ? "running" : "completed", `2026-09-02T01:00:${String(index + 2).padStart(2, "0")}.000Z`, index + 3);
  }
  assert.equal(events.length, maxWebMcpReceiptEvents);
  const receipt = createWebMcpSessionReceipt(events, "2026-09-02T02:00:00.000Z", "https://trialbridge.example");
  const serialized = JSON.stringify(receipt);
  assert.match(serialized, /download-only/);
  assert.match(serialized, /No medical note/);
  assert.doesNotMatch(serialized, /gastric cancer|stage IV|rawText|maskedText|patientFact|toolOutput/i);
});
