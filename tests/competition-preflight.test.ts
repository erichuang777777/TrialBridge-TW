import assert from "node:assert/strict";
import test from "node:test";
import { CloudProbeError } from "../lib/llm/cloudProbe.ts";
import { runCompetitionPreflight } from "../lib/demo/preflight.ts";

const cloudReady = {
  status: "ready" as const,
  requestedModel: "gpt-oss:120b-cloud",
  reportedModel: "gpt-oss:120b",
  transport: "localhost_ollama_proxy" as const,
  inference: "remote-cloud-only" as const,
  latencyMs: 242,
  checkedAt: "2026-09-02T00:00:00.000Z",
  timeoutMs: 30_000,
  persisted: false as const,
  containsHealthInformation: false as const,
  storesModelContent: false as const,
};

const source = (registry: "TFDA" | "ClinicalTrials.gov", count: number, durationMs: number) => ({
  registry,
  count,
  retrievedAt: "2026-09-02T00:00:00.000Z",
  durationMs,
  dataState: { mode: "live" as const, loadedAt: "2026-09-02T00:00:00.000Z" },
});

test("competition preflight returns readiness metadata without trial records or model content", async () => {
  const times = [100, 450];
  const receipt = await runCompetitionPreflight({
    now: () => times.shift() ?? 450,
    checkedAt: () => new Date("2026-09-02T00:00:00.000Z"),
    runCloud: async () => cloudReady,
    runRegistries: async () => ({ trials: [], sources: [source("TFDA", 4, 80), source("ClinicalTrials.gov", 3, 120)], failures: [] }),
  });
  assert.equal(receipt.status, "ready");
  assert.equal(receipt.latencyMs, 350);
  assert.equal(receipt.cloud.state, "ready");
  assert.equal(receipt.registries.state, "ready");
  assert.equal(receipt.registries.sources.length, 2);
  assert.equal(receipt.returnsTrialRecords, false);
  assert.equal(receipt.containsHealthInformation, false);
  assert.equal(receipt.storesModelContent, false);
  assert.equal(receipt.persisted, false);
  assert.doesNotMatch(JSON.stringify(receipt), /"trials"|title|summary|intervention|eligibility|message|thinking/i);
});

test("competition preflight keeps partial dependency failure explicit", async () => {
  const receipt = await runCompetitionPreflight({
    runCloud: async () => { throw new CloudProbeError("unavailable", "CLOUD_PROBE_UNAVAILABLE"); },
    runRegistries: async () => ({
      trials: [],
      sources: [source("TFDA", 2, 90)],
      failures: [{ registry: "ClinicalTrials.gov", code: "SOURCE_TIMEOUT", durationMs: 20_000, message: "omitted" }],
    }),
  });
  assert.equal(receipt.status, "partial");
  assert.deepEqual(receipt.cloud, { state: "unavailable", code: "CLOUD_PROBE_UNAVAILABLE" });
  assert.equal(receipt.registries.state, "partial");
  assert.deepEqual(receipt.registries.failures, [{ registry: "ClinicalTrials.gov", code: "SOURCE_TIMEOUT", durationMs: 20_000 }]);
});

test("competition preflight preserves caller cancellation", async () => {
  const controller = new AbortController();
  controller.abort(new DOMException("judge cancelled", "AbortError"));
  await assert.rejects(() => runCompetitionPreflight({
    signal: controller.signal,
    runCloud: async () => cloudReady,
    runRegistries: async () => ({ trials: [], sources: [], failures: [] }),
  }), (error: unknown) => error === controller.signal.reason);
});
