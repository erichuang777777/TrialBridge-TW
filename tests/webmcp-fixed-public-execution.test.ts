import assert from "node:assert/strict";
import test from "node:test";
import {
  createFixedPublicExecutionReceipt,
  executeFixedPublicSearchToolCompat,
  fixedPublicExecutionContract,
  fixedPublicExecutionTimeoutMs,
  fixedPublicSearchCondition,
} from "../lib/webmcp/fixedPublicExecution.ts";

const publicSearchTool = {
  name: "search_public_cancer_trials",
  annotations: { readOnlyHint: true, untrustedContentHint: true },
} as WebMCP.RegisteredTool;

const publicOutput = {
  query: "胃癌",
  queryPlan: { registryConditions: { TFDA: "胃癌", "ClinicalTrials.gov": "gastric cancer" } },
  recordCount: 3,
  completeness: "partial",
  sourceStatus: {
    completed: [{ registry: "TFDA", count: 2 }, { registry: "ClinicalTrials.gov", count: 1 }],
    failed: [{ registry: "ClinicalTrials.gov", code: "SOURCE_TIMEOUT" }],
  },
  records: [
    { title: "A".repeat(180), region: "Taiwan" },
    { title: "Synthetic public trial two", region: "Asia" },
    { title: "Synthetic public trial three", region: "Worldwide" },
    { title: "This fourth record must be omitted", region: "Worldwide" },
  ],
};

test("fixed public execution uses only the exact read-only public search input", async () => {
  const calls: Array<{ input: unknown; signal?: AbortSignal }> = [];
  const controller = new AbortController();
  const context = {
    executeTool: async (_tool: WebMCP.RegisteredTool, input: Record<string, unknown> | string, options?: { signal?: AbortSignal }) => {
      calls.push({ input, signal: options?.signal });
      return publicOutput;
    },
  } as Pick<WebMCP.ModelContext, "executeTool">;
  const result = await executeFixedPublicSearchToolCompat(context, publicSearchTool, controller.signal);
  assert.equal(result.compatibilityProfile, "object_input");
  assert.equal(result.output, publicOutput);
  assert.deepEqual(calls.map((call) => call.input), [{ condition: "胃癌" }]);
  assert.equal(calls[0].signal, controller.signal);
  assert.equal(fixedPublicExecutionContract.behavior.acceptsFreeText, false);
  assert.equal(fixedPublicExecutionContract.behavior.executesOnlyFixedPublicSearch, true);
  assert.equal(fixedPublicExecutionContract.privacyBoundary.readsPatientContext, false);
  assert.equal(fixedPublicExecutionContract.privacyBoundary.storesExecutionResult, false);
  assert.equal(fixedPublicExecutionTimeoutMs, 25_000);
});

test("fixed public execution supports current-Chrome serialized input without retrying ordinary failures", async () => {
  const inputs: unknown[] = [];
  const serializedContext = {
    executeTool: async (_tool: WebMCP.RegisteredTool, input: Record<string, unknown> | string) => {
      inputs.push(input);
      if (typeof input !== "string") throw new TypeError("DOMString input required");
      return publicOutput;
    },
  } as Pick<WebMCP.ModelContext, "executeTool">;
  const serialized = await executeFixedPublicSearchToolCompat(serializedContext, publicSearchTool);
  assert.equal(serialized.compatibilityProfile, "serialized_input");
  assert.deepEqual(inputs, [{ condition: "胃癌" }, JSON.stringify({ condition: "胃癌" })]);

  let failureCalls = 0;
  const failedContext = { executeTool: async () => { failureCalls += 1; throw new Error("registry unavailable"); } } as unknown as Pick<WebMCP.ModelContext, "executeTool">;
  await assert.rejects(executeFixedPublicSearchToolCompat(failedContext, publicSearchTool), /registry unavailable/);
  assert.equal(failureCalls, 1);
});

test("fixed public execution refuses other tools, missing safety hints, and retries nothing after cancellation", async () => {
  const context = { executeTool: async () => publicOutput } as unknown as Pick<WebMCP.ModelContext, "executeTool">;
  await assert.rejects(executeFixedPublicSearchToolCompat(context, { ...publicSearchTool, name: "draft_trial_outreach" }), /restricted/);
  await assert.rejects(executeFixedPublicSearchToolCompat(context, { ...publicSearchTool, annotations: { readOnlyHint: true } }), /restricted/);

  const controller = new AbortController();
  let calls = 0;
  const cancelledContext = {
    executeTool: async () => {
      calls += 1;
      controller.abort(new DOMException("judge cancelled", "AbortError"));
      throw new TypeError("must not trigger serialization fallback");
    },
  } as unknown as Pick<WebMCP.ModelContext, "executeTool">;
  await assert.rejects(executeFixedPublicSearchToolCompat(cancelledContext, publicSearchTool, controller.signal), (error: unknown) => error === controller.signal.reason);
  assert.equal(calls, 1);
});

test("fixed public execution receipt keeps bounded public evidence only", () => {
  const receipt = createFixedPublicExecutionReceipt(publicOutput, "object_input", "2026-09-02T00:00:00.000Z");
  assert.equal(receipt.state, "partial");
  assert.equal(receipt.fixedCondition, fixedPublicSearchCondition);
  assert.equal(receipt.browserApiUsed, true);
  assert.equal(receipt.recordCount, 3);
  assert.equal(receipt.records.length, 3);
  assert.equal(receipt.records[0].title.length, 140);
  assert.deepEqual(receipt.registryConditions, { TFDA: "胃癌", "ClinicalTrials.gov": "gastric cancer" });
  assert.equal(receipt.completedSources.length, 2);
  assert.equal(receipt.failedSources, 1);
  assert.equal(receipt.containsHealthInformation, false);
  assert.equal(receipt.persisted, false);
  assert.equal(JSON.stringify(receipt).length <= 1_500, true);
  assert.doesNotMatch(JSON.stringify(receipt), /SOURCE_TIMEOUT|limitation|retrievedAt/);
});

test("fixed public receipt rejects a changed condition, truncation, or missing bilingual plan", () => {
  assert.throws(() => createFixedPublicExecutionReceipt({ ...publicOutput, query: "lung cancer" }, "object_input"), /fixed public condition/);
  assert.throws(() => createFixedPublicExecutionReceipt({ truncated: true, content: "partial" }, "object_input"), /truncated/);
  assert.throws(() => createFixedPublicExecutionReceipt({ ...publicOutput, queryPlan: {} }, "object_input"), /bilingual query plan/);
});
