import assert from "node:assert/strict";
import test from "node:test";
import { executeSafeMethodToolCompat } from "../lib/webmcp/compatibility.ts";

const tool = { name: "trialbridge_method", annotations: { readOnlyHint: true } } as WebMCP.RegisteredTool;

test("WebMCP compatibility executes with the upstream object input first", async () => {
  const inputs: unknown[] = [];
  const context = {
    executeTool: async (_tool: WebMCP.RegisteredTool, input: Record<string, unknown> | string) => {
      inputs.push(input);
      return "object-result";
    },
  } as Pick<WebMCP.ModelContext, "executeTool">;

  const result = await executeSafeMethodToolCompat(context, tool);
  assert.equal(result, "object-result");
  assert.deepEqual(inputs, [{}]);
});

test("WebMCP compatibility retries with serialized input for the current Chrome Origin Trial", async () => {
  const inputs: unknown[] = [];
  const context = {
    executeTool: async (_tool: WebMCP.RegisteredTool, input: Record<string, unknown> | string) => {
      inputs.push(input);
      if (typeof input !== "string") throw new TypeError("Origin Trial expects DOMString input");
      return "serialized-result";
    },
  } as Pick<WebMCP.ModelContext, "executeTool">;

  const result = await executeSafeMethodToolCompat(context, tool);
  assert.equal(result, "serialized-result");
  assert.deepEqual(inputs, [{}, "{}"]);
});

test("WebMCP compatibility refuses any tool that is not the safe read-only method tool", async () => {
  const context = { executeTool: async () => "unexpected" } as unknown as Pick<WebMCP.ModelContext, "executeTool">;
  const unsafe = { name: "draft_trial_outreach", annotations: { readOnlyHint: true } } as WebMCP.RegisteredTool;
  await assert.rejects(executeSafeMethodToolCompat(context, unsafe), /restricted to the read-only public method tool/);
});
