/// <reference types="webmcp-types" />
import assert from "node:assert/strict";
import test from "node:test";
import { runWebMcpRuntimeAcceptance, webMcpRuntimeAcceptanceChecks, webMcpRuntimeProbeName } from "../lib/webmcp/runtimeAcceptance.ts";

class MockModelContext extends EventTarget {
  private readonly definitions = new Map<string, WebMCP.ModelContextTool>();
  private readonly serializedOnly: boolean;
  private readonly dropExecutionSignal: boolean;
  private readonly serializeDiscoveredSchema: boolean;
  private readonly executionDelayMs: number;
  private readonly objectOnly: boolean;
  constructor(serializedOnly = false, dropExecutionSignal = false, serializeDiscoveredSchema = false, executionDelayMs = 0, objectOnly = false) {
    super();
    this.serializedOnly = serializedOnly;
    this.dropExecutionSignal = dropExecutionSignal;
    this.serializeDiscoveredSchema = serializeDiscoveredSchema;
    this.executionDelayMs = executionDelayMs;
    this.objectOnly = objectOnly;
    this.definitions.set("trialbridge_method", {
      name: "trialbridge_method",
      title: "TrialBridge method",
      description: "Read-only public method.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({ searchOrder: ["Taiwan", "Asia", "worldwide"], limitation: "Synthetic test output." }),
    });
  }

  async registerTool(tool: WebMCP.ModelContextTool, options?: WebMCP.ModelContextRegisterToolOptions) {
    this.definitions.set(tool.name, tool);
    options?.signal?.addEventListener("abort", () => {
      this.definitions.delete(tool.name);
      this.dispatchEvent(new Event("toolchange"));
    }, { once: true });
    this.dispatchEvent(new Event("toolchange"));
  }

  async getTools() {
    return [...this.definitions.values()].map((tool) => ({
      name: tool.name,
      title: tool.title ?? "",
      description: tool.description,
      inputSchema: this.serializeDiscoveredSchema ? JSON.stringify(tool.inputSchema) : tool.inputSchema,
      annotations: tool.annotations,
      origin: "https://trialbridge.example",
      window: {} as Window,
    })).sort((left, right) => left.name.localeCompare(right.name));
  }

  async executeTool(tool: WebMCP.RegisteredTool, input: Record<string, unknown> | string, options?: { signal?: AbortSignal }) {
    if (this.serializedOnly && typeof input !== "string") throw new TypeError("DOMString input required");
    if (this.objectOnly && typeof input === "string") throw new TypeError("Object input required");
    const definition = this.definitions.get(tool.name);
    if (!definition) throw new Error("Tool not found");
    const parsed = typeof input === "string" ? JSON.parse(input) as Record<string, unknown> : input;
    if (this.executionDelayMs > 0 && tool.name === webMcpRuntimeProbeName) await new Promise((resolve) => setTimeout(resolve, this.executionDelayMs));
    if (this.dropExecutionSignal) return definition.execute(parsed, undefined as unknown as { signal: AbortSignal });
    const signal = options?.signal ?? new AbortController().signal;
    return definition.execute(parsed, { signal });
  }
}

test("one-click runtime acceptance covers registration, execution, cancellation, toolchange, and cleanup", async () => {
  const context = new MockModelContext(true, false, true, 40) as unknown as WebMCP.ModelContext;
  const result = await runWebMcpRuntimeAcceptance(context, "https://trialbridge.example", 250);
  assert.equal(result.state, "passed");
  assert.equal(result.checks.length, webMcpRuntimeAcceptanceChecks.length);
  assert.equal(result.checks.every((check) => check.status === "pass"), true);
  assert.equal(result.toolchangeEvents, 2);
  assert.equal((await context.getTools()).some((tool) => tool.name === webMcpRuntimeProbeName), false);
  assert.equal(result.containsHealthInformation, false);
  assert.equal(result.storesToolPayloads, false);
  assert.doesNotMatch(JSON.stringify(result), /toolArgument|toolOutput|rawText|maskedText|confirmedProfile|trialResult/i);
});

test("runtime acceptance falls back to object input for draft implementations", async () => {
  const context = new MockModelContext(false, false, false, 10, true) as unknown as WebMCP.ModelContext;
  const result = await runWebMcpRuntimeAcceptance(context, "https://trialbridge.example", 250);
  assert.equal(result.state, "passed");
  assert.equal(result.checks.find((check) => check.id === "execution_cancellation")?.status, "pass");
  assert.equal((await context.getTools()).some((tool) => tool.name === webMcpRuntimeProbeName), false);
});

test("runtime acceptance reports missing execution cancellation but still removes the probe", async () => {
  const context = new MockModelContext(false, true) as unknown as WebMCP.ModelContext;
  const result = await runWebMcpRuntimeAcceptance(context, "https://trialbridge.example", 75);
  assert.equal(result.state, "failed");
  assert.equal(result.checks.find((check) => check.id === "execution_cancellation")?.status, "fail");
  assert.equal(result.checks.find((check) => check.id === "probe_cleanup")?.status, "pass");
  assert.equal((await context.getTools()).some((tool) => tool.name === webMcpRuntimeProbeName), false);
});
