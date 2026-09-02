"use client";

import { useEffect, useRef, useState } from "react";
import { buildTrialBridgeTools } from "@/lib/webmcp/tools";
import { executeSafeMethodToolCompat } from "@/lib/webmcp/compatibility";
import { createQuickMethodReceipt, quickJudgeDemoContract, type QuickMethodReceipt } from "@/lib/webmcp/quickJudgeDemo";
import { webMcpLocalTestingFlag } from "@/lib/webmcp/browserSetup";

type BrowserState = "checking" | "unsupported" | "registering" | "ready" | "error";
type ExecutionState = "idle" | "running" | "passed" | "failed" | "cancelled" | "timed_out";
type HeaderState = { permissions: boolean; opener: boolean; mime: boolean };

export function QuickJudgeConsole() {
  const [browserState, setBrowserState] = useState<BrowserState>("checking");
  const [registeredNames, setRegisteredNames] = useState<string[]>([]);
  const [headers, setHeaders] = useState<HeaderState>({ permissions: false, opener: false, mime: false });
  const [executionState, setExecutionState] = useState<ExecutionState>("idle");
  const [receipt, setReceipt] = useState<QuickMethodReceipt>();
  const [elapsed, setElapsed] = useState(0);
  const registeredTools = useRef<WebMCP.RegisteredTool[]>([]);
  const executionController = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    const registrationController = new AbortController();
    const modelContext = document.modelContext;
    void fetch("/", { method: "HEAD", cache: "no-store", signal: registrationController.signal }).then((response) => {
      if (active) setHeaders({
        permissions: response.headers.get("permissions-policy")?.includes("tools=(self)") ?? false,
        opener: response.headers.get("cross-origin-opener-policy") === "same-origin",
        mime: response.headers.get("x-content-type-options") === "nosniff",
      });
    }).catch(() => undefined);
    if (!modelContext) {
      setBrowserState("unsupported");
      return () => {
        active = false;
        registrationController.abort();
      };
    }
    setBrowserState("registering");
    void (async () => {
      try {
        const tools = buildTrialBridgeTools({ matches: [], sensitiveConsent: false });
        await Promise.all(tools.map((tool) => modelContext.registerTool(tool, { signal: registrationController.signal, exposedTo: [location.origin] })));
        const discovered = await modelContext.getTools({ fromOrigins: [location.origin] });
        if (!active) return;
        const expected = new Set(quickJudgeDemoContract.publicToolNames);
        registeredTools.current = discovered.filter((tool) => expected.has(tool.name as typeof quickJudgeDemoContract.publicToolNames[number]));
        const names = [...new Set(registeredTools.current.map((tool) => tool.name))].sort();
        setRegisteredNames(names);
        setBrowserState(names.length === expected.size ? "ready" : "error");
      } catch {
        if (active && !registrationController.signal.aborted) setBrowserState("error");
      }
    })();
    return () => {
      active = false;
      registrationController.abort();
    };
  }, []);

  useEffect(() => {
    if (executionState !== "running") return;
    setElapsed(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1_000)), 250);
    return () => window.clearInterval(timer);
  }, [executionState]);

  useEffect(() => () => executionController.current?.abort(), []);

  async function runSafeMethod() {
    if (browserState !== "ready" || executionState === "running") return;
    const modelContext = document.modelContext;
    const method = registeredTools.current.find((tool) => tool.name === quickJudgeDemoContract.safeExecutionTool);
    if (!modelContext || !method) {
      setExecutionState("failed");
      return;
    }
    executionController.current?.abort();
    const controller = new AbortController();
    executionController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(new DOMException("Safe method timed out.", "TimeoutError")), quickJudgeDemoContract.executionTimeoutMs);
    setReceipt(undefined);
    setExecutionState("running");
    try {
      const output = await executeSafeMethodToolCompat(modelContext, method, controller.signal);
      setReceipt(createQuickMethodReceipt(output));
      setExecutionState("passed");
    } catch {
      const reason = controller.signal.reason;
      if (controller.signal.aborted) setExecutionState(reason instanceof DOMException && reason.name === "TimeoutError" ? "timed_out" : "cancelled");
      else setExecutionState("failed");
    } finally {
      window.clearTimeout(timeout);
      if (executionController.current === controller) executionController.current = null;
    }
  }

  function cancelSafeMethod() {
    executionController.current?.abort(new DOMException("Judge cancelled safe method.", "AbortError"));
  }

  const headerCount = Object.values(headers).filter(Boolean).length;
  const browserStatus = browserState === "checking" ? "Checking this browser"
    : browserState === "registering" ? "Registering two public tools"
      : browserState === "ready" ? "2/2 public tools discovered"
        : browserState === "unsupported" ? "WebMCP preview is off or unsupported"
          : "Browser check needs attention";
  const executionStatus = executionState === "idle" ? "Not run. No tool has been executed."
    : executionState === "running" ? `Executing the fixed read-only method · ${elapsed}s elapsed · ${Math.max(0, quickJudgeDemoContract.executionTimeoutMs / 1_000 - elapsed)}s remaining.`
      : executionState === "passed" ? "Pass. The browser returned TrialBridge's bounded method contract."
        : executionState === "cancelled" ? "Cancelled. No page or workflow state changed."
          : executionState === "timed_out" ? "Stopped after 10 seconds. No result was retained."
            : "The safe method did not return a valid bounded receipt. Use the full lab for diagnostics.";

  return <section className={`quick-judge-console quick-browser-${browserState}`} aria-labelledby="quick-console-title">
    <div className="quick-console-heading"><div><p className="eyebrow">Live current-browser check</p><h2 id="quick-console-title">Discover, then execute one safe method.</h2></div><span role="status" aria-atomic="true">{browserStatus}</span></div>
    <ul className="quick-check-grid">
      <li className={browserState === "ready" ? "check-pass" : undefined}><i aria-hidden="true" /><small>Native API</small><strong>{browserState === "ready" ? "document.modelContext" : browserState === "unsupported" ? "Preview not detected" : browserState === "error" ? "Needs attention" : "Checking"}</strong></li>
      <li className={registeredNames.length === quickJudgeDemoContract.publicToolNames.length ? "check-pass" : undefined}><i aria-hidden="true" /><small>Public capability</small><strong>{registeredNames.length}/2 origin-scoped tools</strong></li>
      <li className={headerCount === 3 ? "check-pass" : undefined}><i aria-hidden="true" /><small>Security headers</small><strong>{headerCount}/3 verified</strong></li>
    </ul>
    {browserState === "unsupported" && <aside className="quick-browser-recovery"><strong>No visitor extension is required.</strong><p>For local Chrome testing, enable the native preview, relaunch, then reopen this page.</p><code>{webMcpLocalTestingFlag}</code><a href="/webmcp#browser-setup-title">Open setup details</a></aside>}
    <section className={`quick-method-check quick-method-${executionState}`} aria-labelledby="quick-method-title" aria-busy={executionState === "running"}>
      <div><span>Step 02 · Explicit execution</span><strong id="quick-method-title">Run <code>trialbridge_method</code></strong><p>No input, network request, model call, registry search, patient context, or write authority.</p></div>
      {receipt && <div className="quick-method-receipt"><dl><div><dt>Search order</dt><dd>{receipt.searchOrder.join(" → ")}</dd></div><div><dt>Sources</dt><dd>{receipt.sources.join(" + ")}</dd></div><div><dt>Privacy</dt><dd>{receipt.privacy}</dd></div><div><dt>Limit</dt><dd>{receipt.limitation}</dd></div></dl></div>}
      <p className="quick-method-status" role="status" aria-atomic="true">{executionStatus}</p>
      <div className="quick-method-actions">{executionState === "running" ? <button type="button" onClick={cancelSafeMethod}>Cancel safe execution</button> : <button className="primary-action" type="button" disabled={browserState !== "ready"} onClick={() => void runSafeMethod()}>{executionState === "idle" ? "Execute safe method" : "Run safe method again"}</button>}<small>10-second limit · result stays in this tab · no persistence</small></div>
    </section>
    <p className="quick-console-boundary"><strong>Evidence boundary:</strong> this concise check proves only current-browser discovery and a fixed safe method. It does not prove model selection, registry execution, protected-state tools, Inspector behavior, or clinical quality.</p>
  </section>;
}
