"use client";

import { useEffect, useState } from "react";
import { buildTrialBridgeTools } from "@/lib/webmcp/tools";

type DiagnosticState = "checking" | "unsupported" | "ready" | "error";
type HeaderChecks = { permissionsPolicy: boolean; openerPolicy: boolean; noSniff: boolean };

const publicToolNames = ["trialbridge_method", "search_public_cancer_trials"];

export function WebMcpDiagnostics() {
  const [state, setState] = useState<DiagnosticState>("checking");
  const [discoveredNames, setDiscoveredNames] = useState<string[]>([]);
  const [headers, setHeaders] = useState<HeaderChecks>({ permissionsPolicy: false, openerPolicy: false, noSniff: false });
  const [executionAvailable, setExecutionAvailable] = useState(false);
  const [error, setError] = useState("");
  const [selfTest, setSelfTest] = useState<{ state: "idle" | "running" | "passed" | "failed"; output?: string }>({ state: "idle" });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/", { method: "HEAD", cache: "no-store", signal: controller.signal });
        if (active) setHeaders({
          permissionsPolicy: response.headers.get("permissions-policy")?.includes("tools=(self)") ?? false,
          openerPolicy: response.headers.get("cross-origin-opener-policy") === "same-origin",
          noSniff: response.headers.get("x-content-type-options") === "nosniff",
        });
      } catch {
        if (active && !controller.signal.aborted) setError("Security headers could not be read from this origin.");
      }

      const modelContext = document.modelContext;
      if (!modelContext) {
        if (active) setState("unsupported");
        return;
      }
      if (active) setExecutionAvailable(typeof modelContext.executeTool === "function");

      try {
        const tools = buildTrialBridgeTools({ matches: [], sensitiveConsent: false });
        await Promise.all(tools.map((tool) => modelContext.registerTool(tool, { signal: controller.signal, exposedTo: [location.origin] })));
        const discovered = await modelContext.getTools({ fromOrigins: [location.origin] });
        if (!active) return;
        const names = [...new Set(discovered.map((tool) => tool.name).filter((name) => publicToolNames.includes(name)))];
        setDiscoveredNames(names);
        setState(names.length === publicToolNames.length ? "ready" : "error");
        if (names.length !== publicToolNames.length) setError(`Expected ${publicToolNames.length} public tools but discovered ${names.length}.`);
      } catch (diagnosticError) {
        if (!active || controller.signal.aborted) return;
        setError(diagnosticError instanceof Error ? diagnosticError.message : "WebMCP registration failed.");
        setState("error");
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  async function runSafeSelfTest() {
    const modelContext = document.modelContext;
    if (!modelContext || typeof modelContext.executeTool !== "function") return;
    setSelfTest({ state: "running" });
    try {
      const tools = await modelContext.getTools({ fromOrigins: [location.origin] });
      const methodTool = tools.find((tool) => tool.name === "trialbridge_method");
      if (!methodTool) throw new Error("trialbridge_method is not discoverable on this page.");
      const result = await modelContext.executeTool(methodTool, JSON.stringify({}));
      const output = JSON.stringify(result, null, 2);
      setSelfTest({ state: "passed", output: output.length > 1_500 ? `${output.slice(0, 1_450)}\n…` : output });
    } catch (selfTestError) {
      setSelfTest({ state: "failed", output: selfTestError instanceof Error ? selfTestError.message : "Safe tool execution failed." });
    }
  }

  const supportLabel = {
    checking: "Checking this browser",
    unsupported: "WebMCP API not detected",
    ready: `${discoveredNames.length}/${publicToolNames.length} public tools discovered`,
    error: "WebMCP needs attention",
  }[state];
  const canExecute = state === "ready" && executionAvailable;

  return <section className="diagnostic-console" aria-labelledby="live-diagnostic-title">
    <div className="diagnostic-heading">
      <div><p className="eyebrow">Live browser check</p><h2 id="live-diagnostic-title">WebMCP runtime evidence</h2></div>
      <span className={`diagnostic-status diagnostic-${state}`} role="status" aria-atomic="true">{supportLabel}</span>
    </div>

    <div className="diagnostic-check-grid">
      <DiagnosticCheck label="Browser API" passed={state === "ready"} pending={state === "checking"} detail={state === "unsupported" ? "Use a compatible Chrome build and enable WebMCP." : "document.modelContext"} />
      <DiagnosticCheck label="Public tools" passed={state === "ready"} pending={state === "checking"} detail={state === "ready" ? discoveredNames.join(" · ") : "Origin-scoped discovery"} />
      <DiagnosticCheck label="Tool permission" passed={headers.permissionsPolicy} pending={state === "checking"} detail="Permissions-Policy: tools=(self)" />
      <DiagnosticCheck label="Origin isolation" passed={headers.openerPolicy} pending={state === "checking"} detail="Cross-Origin-Opener-Policy: same-origin" />
      <DiagnosticCheck label="MIME protection" passed={headers.noSniff} pending={state === "checking"} detail="X-Content-Type-Options: nosniff" />
    </div>

    {error && <p className="diagnostic-error" role="alert">{error}</p>}

    <div className="self-test-panel">
      <div><strong>Safe execution check</strong><p>Runs only <code>trialbridge_method</code>. It uses no medical context, registry call, or write action.</p></div>
      <button className="primary-action" type="button" disabled={!canExecute || selfTest.state === "running"} onClick={() => void runSafeSelfTest()}>{selfTest.state === "running" ? "Running…" : "Run safe live check"}</button>
    </div>
    {!canExecute && state !== "checking" && <p className="field-helper">Live execution requires a browser implementation that exposes <code>document.modelContext.executeTool</code>. Static conformance and the human workflow remain available.</p>}
    {selfTest.output && <pre className={`diagnostic-output diagnostic-output-${selfTest.state}`} aria-label="Safe WebMCP execution output">{selfTest.output}</pre>}
  </section>;
}

function DiagnosticCheck({ label, passed, pending, detail }: { label: string; passed: boolean; pending: boolean; detail: string }) {
  const state = pending ? "Checking" : passed ? "Pass" : "Unavailable";
  return <article className={`diagnostic-check ${pending ? "check-pending" : passed ? "check-pass" : "check-unavailable"}`}>
    <span aria-hidden="true" />
    <div><strong>{label}</strong><small>{detail}</small></div>
    <b>{state}</b>
  </article>;
}
