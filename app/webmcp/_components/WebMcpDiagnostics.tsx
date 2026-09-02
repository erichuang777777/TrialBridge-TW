"use client";

import { useEffect, useRef, useState } from "react";
import { buildTrialBridgeTools } from "@/lib/webmcp/tools";
import { createWebMcpDiagnosticReceipt } from "@/lib/webmcp/diagnosticReceipt";
import { runWebMcpRuntimeAcceptance, webMcpRuntimeAcceptanceChecks, type WebMcpRuntimeAcceptanceResult } from "@/lib/webmcp/runtimeAcceptance";

type DiagnosticState = "checking" | "unsupported" | "ready" | "error";
type HeaderChecks = { permissionsPolicy: boolean; openerPolicy: boolean; noSniff: boolean };
type CloudProbeResult = { status: "ready"; requestedModel: string; reportedModel: string; transport: "localhost_ollama_proxy"; inference: "remote-cloud-only"; latencyMs: number; checkedAt: string; timeoutMs: number; persisted: false; containsHealthInformation: false; storesModelContent: false };
type CloudProbeView = { state: "not-run" | "running" | "ready" | "failed" | "cancelled"; result?: CloudProbeResult; error?: string };
type RuntimeAcceptanceView = { state: "idle" | "running" | "passed" | "failed"; result?: WebMcpRuntimeAcceptanceResult; error?: string };

const publicToolNames = ["trialbridge_method", "search_public_cancer_trials"];

export function WebMcpDiagnostics() {
  const [state, setState] = useState<DiagnosticState>("checking");
  const [discoveredNames, setDiscoveredNames] = useState<string[]>([]);
  const [headers, setHeaders] = useState<HeaderChecks>({ permissionsPolicy: false, openerPolicy: false, noSniff: false });
  const [executionAvailable, setExecutionAvailable] = useState(false);
  const [error, setError] = useState("");
  const [runtimeAcceptance, setRuntimeAcceptance] = useState<RuntimeAcceptanceView>({ state: "idle" });
  const [receiptDownloaded, setReceiptDownloaded] = useState(false);
  const [cloudProbe, setCloudProbe] = useState<CloudProbeView>({ state: "not-run" });
  const [cloudProbeElapsed, setCloudProbeElapsed] = useState(0);
  const cloudProbeController = useRef<AbortController | null>(null);

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

  useEffect(() => {
    if (cloudProbe.state !== "running") return;
    setCloudProbeElapsed(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => setCloudProbeElapsed(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [cloudProbe.state]);

  useEffect(() => () => cloudProbeController.current?.abort(), []);

  async function runRuntimeAcceptance() {
    const modelContext = document.modelContext;
    if (!modelContext || typeof modelContext.executeTool !== "function") return;
    setRuntimeAcceptance({ state: "running" });
    try {
      const result = await runWebMcpRuntimeAcceptance(modelContext, location.origin);
      setRuntimeAcceptance({ state: result.state, result });
    } catch {
      setRuntimeAcceptance({ state: "failed", error: "The runtime suite stopped unexpectedly after attempting probe cleanup." });
    }
  }

  async function runCloudProbe() {
    if (cloudProbe.state === "running") return;
    cloudProbeController.current?.abort();
    const controller = new AbortController();
    cloudProbeController.current = controller;
    setCloudProbe({ state: "running" });
    try {
      const response = await fetch("/api/cloud/probe", { method: "POST", signal: controller.signal });
      const payload = await response.json() as Partial<CloudProbeResult> & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Cloud probe failed.");
      if (payload.status !== "ready" || payload.requestedModel !== "gpt-oss:120b-cloud" || typeof payload.reportedModel !== "string" || typeof payload.latencyMs !== "number" || payload.containsHealthInformation !== false || payload.storesModelContent !== false || payload.persisted !== false) {
        throw new Error("Cloud probe returned an invalid metadata receipt.");
      }
      setCloudProbe({ state: "ready", result: payload as CloudProbeResult });
    } catch (probeError) {
      if (controller.signal.aborted) setCloudProbe({ state: "cancelled" });
      else setCloudProbe({ state: "failed", error: probeError instanceof Error ? probeError.message : "Cloud probe failed." });
    } finally {
      if (cloudProbeController.current === controller) cloudProbeController.current = null;
    }
  }

  function cancelCloudProbe() {
    cloudProbeController.current?.abort();
    cloudProbeController.current = null;
    setCloudProbe({ state: "cancelled" });
  }

  function downloadDiagnosticReceipt() {
    if (state === "checking") return;
    const generatedAt = new Date().toISOString();
    const publicExecution = runtimeAcceptance.result?.checks.find((check) => check.id === "public_execution");
    const receipt = createWebMcpDiagnosticReceipt({
      generatedAt,
      origin: location.origin,
      browserState: state,
      expectedToolNames: publicToolNames,
      discoveredToolNames: discoveredNames,
      securityHeaders: headers,
      safeExecutionAvailable: executionAvailable,
      safeSelfTestState: runtimeAcceptance.state === "running" ? "running" : publicExecution?.status === "pass" ? "passed" : runtimeAcceptance.state === "failed" ? "failed" : "idle",
      runtimeAcceptance: {
        state: runtimeAcceptance.state,
        result: runtimeAcceptance.result,
      },
      cloudProbe: {
        state: cloudProbe.state,
        requestedModel: cloudProbe.result?.requestedModel,
        reportedModel: cloudProbe.result?.reportedModel,
        latencyMs: cloudProbe.result?.latencyMs,
        checkedAt: cloudProbe.result?.checkedAt,
      },
    });
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(receipt, null, 2)}\n`], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `trialbridge-browser-diagnostic-${generatedAt.slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setReceiptDownloaded(true);
    window.setTimeout(() => setReceiptDownloaded(false), 4_000);
  }

  const supportLabel = {
    checking: "Checking this browser",
    unsupported: "WebMCP browser preview off or unsupported",
    ready: `${discoveredNames.length}/${publicToolNames.length} public tools discovered`,
    error: "WebMCP needs attention",
  }[state];
  const canExecute = state === "ready" && executionAvailable;
  const runtimePassed = runtimeAcceptance.result?.checks.filter((check) => check.status === "pass").length ?? 0;
  const runtimeStatus = runtimeAcceptance.state === "idle" ? "Not run. No temporary diagnostic tool has been registered."
    : runtimeAcceptance.state === "running" ? `Running ${webMcpRuntimeAcceptanceChecks.length} current-browser lifecycle checks. The temporary probe will be removed automatically.`
      : runtimeAcceptance.state === "passed" ? `${runtimePassed} of ${webMcpRuntimeAcceptanceChecks.length} runtime checks passed. The temporary probe was removed.`
        : `${runtimePassed} of ${webMcpRuntimeAcceptanceChecks.length} runtime checks passed. ${runtimeAcceptance.error ?? "Review the failed checks; probe cleanup was attempted."}`;
  const cloudProbeStatus = cloudProbe.state === "not-run" ? "Not run. No cloud request has been sent."
    : cloudProbe.state === "running" ? "Checking gpt-oss:120b-cloud with fixed synthetic text. This stops after 30 seconds."
      : cloudProbe.state === "ready" && cloudProbe.result ? `Cloud model responded in ${cloudProbe.result.latencyMs} ms. No health information was sent or stored.`
        : cloudProbe.state === "cancelled" ? "Cloud probe cancelled. No user content was sent."
          : `Cloud probe failed. ${cloudProbe.error ?? "Retry later."}`;

  return <section className="diagnostic-console" aria-labelledby="live-diagnostic-title">
    <div className="diagnostic-heading">
      <div><p className="eyebrow">Live browser check</p><h2 id="live-diagnostic-title">WebMCP runtime evidence</h2></div>
      <span className={`diagnostic-status diagnostic-${state}`} role="status" aria-atomic="true">{supportLabel}</span>
    </div>

    <div className="diagnostic-check-grid">
      <DiagnosticCheck label="WebMCP browser preview" passed={state === "ready"} pending={state === "checking"} detail={state === "unsupported" ? "Enable chrome://flags/#enable-webmcp-testing, relaunch Chrome, then reopen this page." : "document.modelContext"} />
      <DiagnosticCheck label="Public tools" passed={state === "ready"} pending={state === "checking"} detail={state === "ready" ? discoveredNames.join(" · ") : "Origin-scoped discovery"} />
      <DiagnosticCheck label="Tool permission" passed={headers.permissionsPolicy} pending={state === "checking"} detail="Permissions-Policy: tools=(self)" />
      <DiagnosticCheck label="Origin isolation" passed={headers.openerPolicy} pending={state === "checking"} detail="Cross-Origin-Opener-Policy: same-origin" />
      <DiagnosticCheck label="MIME protection" passed={headers.noSniff} pending={state === "checking"} detail="X-Content-Type-Options: nosniff" />
    </div>

    {error && <p className="diagnostic-error" role="alert">{error}</p>}

    <section className={`runtime-acceptance-panel runtime-acceptance-${runtimeAcceptance.state}`} aria-labelledby="runtime-acceptance-title">
      <div className="runtime-acceptance-heading"><div><strong id="runtime-acceptance-title">One-click WebMCP lifecycle acceptance</strong><p>Exercises <code>registerTool</code>, same-origin <code>getTools</code>, bounded <code>executeTool</code>, execution cancellation, <code>toolchange</code>, and registration cleanup.</p></div><span>{runtimeAcceptance.state === "idle" ? "Optional" : runtimeAcceptance.state}</span></div>
      <button className="primary-action" type="button" disabled={!canExecute || runtimeAcceptance.state === "running"} onClick={() => void runRuntimeAcceptance()}>{runtimeAcceptance.state === "running" ? "Running 6 checks…" : runtimeAcceptance.state === "idle" ? "Run lifecycle suite" : "Run again"}</button>
      <p className="runtime-acceptance-status" role="status" aria-atomic="true">{runtimeStatus}</p>
      {runtimeAcceptance.result && <details className="runtime-acceptance-results">
        <summary>{runtimePassed}/{webMcpRuntimeAcceptanceChecks.length} checks passed <span>Inspect metadata</span></summary>
        <ol>{runtimeAcceptance.result.checks.map((check) => <li key={check.id} className={`runtime-check-${check.status}`}><i aria-hidden="true" /><div><strong>{check.label}</strong><small>{check.detail}</small></div><b>{check.status}</b></li>)}</ol>
      </details>}
      <small className="runtime-acceptance-boundary">The probe is fixed, read-only, no-network, and no-PHI. It briefly appears as <code>trialbridge_runtime_probe</code> only during this explicit check and is unregistered before the result is shown.</small>
    </section>
    <p className="field-helper diagnostic-execution-guidance">{state === "checking" ? "Checking whether this browser exposes live WebMCP execution."
      : canExecute ? "Live lifecycle execution is available. The temporary probe is created only after you run the suite."
        : <>Live execution requires a browser implementation that exposes <code>document.modelContext.executeTool</code>. Static conformance and the human workflow remain available.</>}</p>
    <section className={`cloud-probe-panel cloud-probe-${cloudProbe.state}`} aria-labelledby="cloud-probe-title">
      <div className="cloud-probe-heading"><div><strong id="cloud-probe-title">Live cloud model smoke test</strong><p>Explicitly sends one fixed synthetic prompt through the localhost proxy. It never reads the note, profile, results, or chat.</p></div><span>{cloudProbe.state === "not-run" ? "Optional" : cloudProbe.state}</span></div>
      {cloudProbe.state === "running" && <div className="cloud-probe-progress" aria-hidden="true"><div className="progress-track"><span /></div><p>Elapsed {cloudProbeElapsed}s · automatic stop in {Math.max(0, 30 - cloudProbeElapsed)}s</p></div>}
      {cloudProbe.state === "ready" && cloudProbe.result && <dl className="cloud-probe-receipt"><div><dt>Requested</dt><dd>{cloudProbe.result.requestedModel}</dd></div><div><dt>Provider reported</dt><dd>{cloudProbe.result.reportedModel}</dd></div><div><dt>Latency</dt><dd>{cloudProbe.result.latencyMs} ms</dd></div><div><dt>Checked</dt><dd>{new Date(cloudProbe.result.checkedAt).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC</dd></div></dl>}
      <p className="cloud-probe-status" role="status" aria-atomic="true">{cloudProbeStatus}</p>
      <div className="cloud-probe-actions">{cloudProbe.state === "running" ? <button type="button" onClick={cancelCloudProbe}>Cancel probe</button> : <button className="primary-action" type="button" onClick={() => void runCloudProbe()}>{cloudProbe.state === "not-run" ? "Run cloud smoke test" : "Run again"}</button>}<small>Maximum 3 checks per 10 minutes · no request body · 30-second hard limit</small></div>
    </section>
    <div className="diagnostic-receipt-panel">
      <div><strong>Download this browser&apos;s diagnostic receipt</strong><p>Contains support state, public tool names, header checks, lifecycle check outcomes, and cloud-probe metadata only. No prompts, arguments, outputs, or health information.</p></div>
      <button type="button" disabled={state === "checking"} onClick={downloadDiagnosticReceipt}>{receiptDownloaded ? "Downloaded" : "Download JSON"}</button>
    </div>
    <p className="download-status" role="status" aria-atomic="true">{receiptDownloaded ? "Browser diagnostic receipt downloaded to this device." : ""}</p>
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
