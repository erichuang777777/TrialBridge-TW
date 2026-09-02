import { executeSafeMethodToolCompat } from "./compatibility.ts";

export const webMcpRuntimeProbeName = "trialbridge_runtime_probe";

export const webMcpRuntimeAcceptanceChecks = [
  { id: "probe_registration", label: "Register and discover" },
  { id: "probe_contract", label: "Schema and read-only hints" },
  { id: "public_execution", label: "Execute public method tool" },
  { id: "execution_cancellation", label: "Propagate execution cancellation" },
  { id: "toolchange_events", label: "Observe toolchange lifecycle" },
  { id: "probe_cleanup", label: "Abort registration and clean up" },
] as const;

export type WebMcpRuntimeAcceptanceCheckId = (typeof webMcpRuntimeAcceptanceChecks)[number]["id"];
export type WebMcpRuntimeAcceptanceCheck = {
  id: WebMcpRuntimeAcceptanceCheckId;
  label: string;
  status: "pass" | "fail";
  detail: string;
};

export type WebMcpRuntimeAcceptanceResult = {
  schemaVersion: "1.0";
  artifactClass: "live_browser_runtime_acceptance";
  startedAt: string;
  completedAt: string;
  state: "passed" | "failed";
  probeToolName: typeof webMcpRuntimeProbeName;
  toolchangeEvents: number;
  checks: WebMcpRuntimeAcceptanceCheck[];
  persistence: "volatile-tab-only";
  containsHealthInformation: false;
  storesToolPayloads: false;
  evidenceBoundary: string;
};

const probeDescription = "Temporary read-only TrialBridge runtime probe. It uses fixed synthetic input, makes no request, reads no page data, and is removed when the explicit acceptance check ends.";
const probeInputSchema = {
  type: "object",
  properties: {
    mode: { type: "string", enum: ["wait_for_cancel"], description: "Fixed diagnostic mode used only to verify AbortSignal propagation." },
  },
  required: ["mode"],
  additionalProperties: false,
} as const;

function waitFor(check: () => boolean | Promise<boolean>, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    const inspect = async () => {
      try {
        if (await check()) return resolve(true);
      } catch {
        return resolve(false);
      }
      if (Date.now() - startedAt >= timeoutMs) return resolve(false);
      setTimeout(() => void inspect(), 25);
    };
    void inspect();
  });
}

function createProbeTool(onExecutionStart: () => void, onExecutionAbort: () => void, executionTimeoutMs: number): WebMCP.ModelContextTool {
  return {
    name: webMcpRuntimeProbeName,
    title: "TrialBridge runtime probe",
    description: probeDescription,
    inputSchema: probeInputSchema,
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: async (input, options) => {
      onExecutionStart();
      if (input.mode !== "wait_for_cancel") throw new Error("The runtime probe accepts only its fixed cancellation mode.");
      const signal = options?.signal;
      if (!signal) return "Execution AbortSignal is unavailable in this browser.";
      return new Promise<string>((resolve, reject) => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const stop = () => {
          if (timeout) clearTimeout(timeout);
          onExecutionAbort();
          resolve("Runtime probe observed execution cancellation.");
        };
        if (signal.aborted) return stop();
        signal.addEventListener("abort", stop, { once: true });
        timeout = setTimeout(() => {
          signal.removeEventListener("abort", stop);
          reject(new Error("Runtime probe did not receive execution cancellation."));
        }, executionTimeoutMs);
      });
    },
  };
}

type RuntimeProbeSchema = {
  type?: unknown;
  properties?: { mode?: { type?: unknown; enum?: unknown } };
  required?: unknown;
  additionalProperties?: unknown;
};

function parseDiscoveredSchema(value: unknown): RuntimeProbeSchema | undefined {
  if (typeof value === "string") {
    if (value.length === 0 || value.length > 20_000) return undefined;
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed as RuntimeProbeSchema : undefined;
    } catch {
      return undefined;
    }
  }
  return value && typeof value === "object" ? value as RuntimeProbeSchema : undefined;
}

async function executeProbeCompat(
  modelContext: Pick<WebMCP.ModelContext, "executeTool">,
  tool: WebMCP.RegisteredTool,
  signal: AbortSignal,
) {
  const input = { mode: "wait_for_cancel" };
  try {
    return await modelContext.executeTool(tool, JSON.stringify(input), { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    return modelContext.executeTool(tool, input, { signal });
  }
}

export async function runWebMcpRuntimeAcceptance(
  modelContext: WebMCP.ModelContext,
  origin: string,
  timeoutMs = 1_500,
): Promise<WebMcpRuntimeAcceptanceResult> {
  const startedAt = new Date().toISOString();
  const outcomes = new Map<WebMcpRuntimeAcceptanceCheckId, Omit<WebMcpRuntimeAcceptanceCheck, "id" | "label">>();
  const setOutcome = (id: WebMcpRuntimeAcceptanceCheckId, status: "pass" | "fail", detail: string) => outcomes.set(id, { status, detail });
  const registrationController = new AbortController();
  let toolchangeEvents = 0;
  let executionStarted = false;
  let executionAbortObserved = false;
  let probeRegistered = false;
  const onToolchange = () => { toolchangeEvents += 1; };
  const probeTool = createProbeTool(() => { executionStarted = true; }, () => { executionAbortObserved = true; }, timeoutMs);

  modelContext.addEventListener("toolchange", onToolchange);
  try {
    let methodTool: WebMCP.RegisteredTool | undefined;
    try {
      const initialTools = await modelContext.getTools({ fromOrigins: [origin] });
      methodTool = initialTools.find((tool) => tool.name === "trialbridge_method");
      await modelContext.registerTool(probeTool, { signal: registrationController.signal, exposedTo: [origin] });
      probeRegistered = true;
      const discovered = await waitFor(async () => (await modelContext.getTools({ fromOrigins: [origin] })).some((tool) => tool.name === webMcpRuntimeProbeName), timeoutMs);
      setOutcome("probe_registration", discovered ? "pass" : "fail", discovered ? "Temporary probe registered and discovered on this origin." : "Temporary probe was not discoverable before the deadline.");
    } catch {
      setOutcome("probe_registration", "fail", "The temporary probe could not be registered and discovered.");
    }

    let registeredProbe: WebMCP.RegisteredTool | undefined;
    if (probeRegistered) {
      try {
        registeredProbe = (await modelContext.getTools({ fromOrigins: [origin] })).find((tool) => tool.name === webMcpRuntimeProbeName);
        const schema = parseDiscoveredSchema(registeredProbe?.inputSchema);
        const contractMatches = Boolean(registeredProbe
          && registeredProbe.origin === origin
          && registeredProbe.description === probeDescription
          && schema?.type === "object"
          && schema.additionalProperties === false
          && Array.isArray(schema.required) && schema.required.length === 1 && schema.required[0] === "mode"
          && schema.properties?.mode?.type === "string"
          && Array.isArray(schema.properties.mode.enum) && schema.properties.mode.enum.length === 1 && schema.properties.mode.enum[0] === "wait_for_cancel"
          && registeredProbe.annotations?.readOnlyHint === true
          && registeredProbe.annotations?.untrustedContentHint === false);
        setOutcome("probe_contract", contractMatches ? "pass" : "fail", contractMatches ? "Discovered schema, origin, and read-only hints match the probe contract." : "Discovered probe metadata did not match the bounded contract.");
      } catch {
        setOutcome("probe_contract", "fail", "Probe metadata could not be inspected.");
      }
    } else {
      setOutcome("probe_contract", "fail", "Probe registration did not complete, so its contract was not inspectable.");
    }

    if (methodTool) {
      try {
        const output = await executeSafeMethodToolCompat(modelContext, methodTool);
        const serializedOutput = JSON.stringify(output);
        const bounded = typeof serializedOutput === "string" && serializedOutput.length > 2 && serializedOutput.length <= 1_500;
        setOutcome("public_execution", bounded ? "pass" : "fail", bounded ? "The public read-only method tool returned a bounded result." : "The public method result was empty or exceeded its output boundary.");
      } catch {
        setOutcome("public_execution", "fail", "The public read-only method tool could not be executed.");
      }
    } else {
      setOutcome("public_execution", "fail", "The public method tool was not discoverable.");
    }

    if (registeredProbe) {
      const executionController = new AbortController();
      const execution = executeProbeCompat(modelContext, registeredProbe, executionController.signal);
      const callbackStarted = await waitFor(() => executionStarted, timeoutMs);
      executionController.abort(new DOMException("Acceptance check cancelled execution.", "AbortError"));
      try { await execution; } catch { /* Cancellation is the expected result. */ }
      if (callbackStarted && !executionAbortObserved) await waitFor(() => executionAbortObserved, timeoutMs);
      setOutcome("execution_cancellation", callbackStarted && executionAbortObserved ? "pass" : "fail", callbackStarted && executionAbortObserved ? "The probe execute callback received the caller AbortSignal." : callbackStarted ? "Execution cancellation did not reach the probe callback." : "The probe callback did not start before the cancellation deadline.");
    } else {
      setOutcome("execution_cancellation", "fail", "The probe was unavailable for the execution-cancellation check.");
    }
  } finally {
    registrationController.abort();
    const cleaned = await waitFor(async () => !(await modelContext.getTools({ fromOrigins: [origin] })).some((tool) => tool.name === webMcpRuntimeProbeName), timeoutMs);
    setOutcome("probe_cleanup", cleaned ? "pass" : "fail", cleaned ? "Registration abort removed the temporary probe." : "The temporary probe remained discoverable after registration abort.");
    await waitFor(() => toolchangeEvents >= 2, timeoutMs);
    setOutcome("toolchange_events", toolchangeEvents >= 2 ? "pass" : "fail", toolchangeEvents >= 2 ? "toolchange was observed for registration and cleanup." : "Fewer than two toolchange events were observed.");
    modelContext.removeEventListener("toolchange", onToolchange);
  }

  const checks = webMcpRuntimeAcceptanceChecks.map((definition) => ({
    ...definition,
    ...(outcomes.get(definition.id) ?? { status: "fail" as const, detail: "This check did not complete." }),
  }));
  return {
    schemaVersion: "1.0",
    artifactClass: "live_browser_runtime_acceptance",
    startedAt,
    completedAt: new Date().toISOString(),
    state: checks.every((check) => check.status === "pass") ? "passed" : "failed",
    probeToolName: webMcpRuntimeProbeName,
    toolchangeEvents: Math.min(toolchangeEvents, 99),
    checks,
    persistence: "volatile-tab-only",
    containsHealthInformation: false,
    storesToolPayloads: false,
    evidenceBoundary: "Current-browser API metadata only. This suite does not prove natural-language tool selection, Inspector behavior, or clinical accuracy.",
  };
}
