"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  liveAgentRehearsalContract,
  liveAgentRehearsalScenarios,
  type LiveAgentRehearsalReceipt,
  type LiveAgentRehearsalScenarioId,
} from "@/lib/webmcp/liveRehearsalContract";
import {
  createFixedPublicExecutionReceipt,
  executeFixedPublicSearchToolCompat,
  fixedPublicExecutionContract,
  fixedPublicExecutionTimeoutMs,
  type FixedPublicExecutionReceipt,
} from "@/lib/webmcp/fixedPublicExecution";

type RehearsalView = {
  state: "idle" | "running" | "passed" | "finding" | "unavailable" | "cancelled";
  receipt?: LiveAgentRehearsalReceipt;
  error?: string;
};

type PublicExecutionView = {
  state: "idle" | "running" | "complete" | "partial" | "unsupported" | "failed" | "cancelled" | "timed_out";
  receipt?: FixedPublicExecutionReceipt;
};

function isReceipt(value: unknown): value is LiveAgentRehearsalReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<LiveAgentRehearsalReceipt>;
  return receipt.schemaVersion === "1.0"
    && (receipt.state === "passed" || receipt.state === "finding" || receipt.state === "unavailable")
    && typeof receipt.scenarioId === "string"
    && Array.isArray(receipt.expectedTools)
    && Array.isArray(receipt.selectedTools)
    && receipt.containsHealthInformation === false
    && receipt.storesModelContentOrThinking === false
    && receipt.executesSelectedTool === false
    && receipt.persisted === false;
}

function toolLabel(tools: string[]) {
  return tools.length > 0 ? tools.join(" · ") : "No tool · safe abstention";
}

export function LiveAgentRehearsal() {
  const [selectedId, setSelectedId] = useState<LiveAgentRehearsalScenarioId>(liveAgentRehearsalScenarios[0].id);
  const [view, setView] = useState<RehearsalView>({ state: "idle" });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [publicExecution, setPublicExecution] = useState<PublicExecutionView>({ state: "idle" });
  const [publicExecutionElapsed, setPublicExecutionElapsed] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const executionControllerRef = useRef<AbortController | null>(null);
  const scenario = useMemo(() => liveAgentRehearsalScenarios.find((item) => item.id === selectedId) ?? liveAgentRehearsalScenarios[0], [selectedId]);

  useEffect(() => {
    if (view.state !== "running") return;
    setElapsedSeconds(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [view.state]);

  useEffect(() => {
    if (publicExecution.state !== "running") return;
    setPublicExecutionElapsed(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => setPublicExecutionElapsed(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [publicExecution.state]);

  useEffect(() => () => {
    controllerRef.current?.abort();
    executionControllerRef.current?.abort();
  }, []);

  function chooseScenario(id: LiveAgentRehearsalScenarioId) {
    if (view.state === "running") return;
    setSelectedId(id);
    setView({ state: "idle" });
    setPublicExecution({ state: "idle" });
  }

  async function runRehearsal() {
    if (view.state === "running") return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setView({ state: "running" });
    setPublicExecution({ state: "idle" });
    try {
      const response = await fetch(liveAgentRehearsalContract.route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: selectedId }),
        signal: controller.signal,
      });
      const payload = await response.json() as unknown;
      if (isReceipt(payload) && payload.scenarioId === selectedId) {
        setView({ state: payload.state, receipt: payload });
        return;
      }
      const error = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "The rehearsal returned an invalid metadata receipt.";
      throw new Error(error);
    } catch (error) {
      if (controller.signal.aborted) setView({ state: "cancelled" });
      else setView({ state: "unavailable", error: error instanceof Error ? error.message : "The rehearsal is unavailable." });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  function cancelRehearsal() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setView({ state: "cancelled" });
  }

  async function runFixedPublicExecution() {
    if (publicExecution.state === "running") return;
    const modelContext = document.modelContext;
    if (!modelContext || typeof modelContext.executeTool !== "function") {
      setPublicExecution({ state: "unsupported" });
      return;
    }
    executionControllerRef.current?.abort();
    const controller = new AbortController();
    executionControllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(new DOMException("Fixed public execution timed out.", "TimeoutError")), fixedPublicExecutionTimeoutMs);
    setPublicExecution({ state: "running" });
    try {
      const discovered = await modelContext.getTools({ fromOrigins: [location.origin] });
      const tool = discovered.find((candidate) => candidate.name === fixedPublicExecutionContract.toolName);
      if (!tool) {
        setPublicExecution({ state: "unsupported" });
        return;
      }
      const result = await executeFixedPublicSearchToolCompat(modelContext, tool, controller.signal);
      const receipt = createFixedPublicExecutionReceipt(result.output, result.compatibilityProfile);
      setPublicExecution({ state: receipt.state, receipt });
    } catch {
      const reason = controller.signal.reason;
      if (controller.signal.aborted) setPublicExecution({ state: reason instanceof DOMException && reason.name === "TimeoutError" ? "timed_out" : "cancelled" });
      else setPublicExecution({ state: "failed" });
    } finally {
      window.clearTimeout(timeout);
      if (executionControllerRef.current === controller) executionControllerRef.current = null;
    }
  }

  function cancelFixedPublicExecution() {
    executionControllerRef.current?.abort(new DOMException("Judge cancelled fixed public execution.", "AbortError"));
  }

  const statusText = view.state === "idle" ? "Ready. No model request has been sent."
    : view.state === "running" ? "gpt-oss:120b-cloud is choosing from the tools available in this synthetic page state."
      : view.state === "passed" ? "Pass. The model selected the expected capability and valid synthetic arguments."
        : view.state === "finding" ? "Finding. The selected capability or arguments differed from the fixed expectation."
          : view.state === "cancelled" ? "Rehearsal cancelled. No tool was executed and no result was stored."
            : `Rehearsal unavailable. ${view.error ?? "Review the finding codes or try again later."}`;
  const canRunFixedPublicExecution = selectedId === "search-direct-zh"
    && view.receipt?.state === "passed"
    && view.receipt.selectedTools.length === 1
    && view.receipt.selectedTools[0] === fixedPublicExecutionContract.toolName;
  const publicExecutionStatus = publicExecution.state === "idle" ? "Not run. The live selection above still executed no tool."
    : publicExecution.state === "running" ? `Executing the fixed public search through this browser. ${publicExecutionElapsed}s elapsed; automatic stop in ${Math.max(0, fixedPublicExecutionTimeoutMs / 1_000 - publicExecutionElapsed)}s.`
      : publicExecution.state === "complete" ? "Complete. This browser executed the fixed public WebMCP search and returned a verified bilingual receipt."
        : publicExecution.state === "partial" ? "Partial. This browser executed the fixed public search; at least one registry was unavailable or incomplete."
          : publicExecution.state === "unsupported" ? "Browser execution unavailable. Enable Chrome WebMCP local testing, relaunch, and run the selection again."
            : publicExecution.state === "cancelled" ? "Public execution cancelled. No result was retained."
              : publicExecution.state === "timed_out" ? "Public execution stopped after 25 seconds. No result was retained."
                : "Public execution failed or returned an invalid bounded receipt. Retry once after checking the browser preview and registries.";

  return <section className={`live-agent-rehearsal rehearsal-${view.state}`} aria-labelledby="live-agent-rehearsal-title" aria-busy={view.state === "running"}>
    <div className="rehearsal-heading"><div><p className="eyebrow">Live agent rehearsal</p><h2 id="live-agent-rehearsal-title">Watch the model choose a WebMCP capability—without executing it.</h2><p>Select one fixed, no-PHI journey. The cloud model receives the tools available in that synthetic page state; TrialBridge compares the returned tool call with the expected contract and discards all model prose and thinking.</p></div><span>{view.state === "idle" ? "Not run" : view.state}</span></div>
    <div className="rehearsal-layout">
      <div className="rehearsal-scenarios" role="group" aria-label="Choose a fixed synthetic agent task">
        {liveAgentRehearsalScenarios.map((item) => <button key={item.id} type="button" aria-pressed={selectedId === item.id} disabled={view.state === "running"} onClick={() => chooseScenario(item.id)}><span>{item.label}</span><small>{item.stateLabel} · {item.intent}</small></button>)}
      </div>
      <article className="rehearsal-prompt">
        <div><span>Fixed prompt</span><small>{scenario.language === "zh-Hant" ? "Traditional Chinese" : "English"}</small></div>
        <blockquote>{scenario.prompt}</blockquote>
        <dl><div><dt>Available state</dt><dd>{scenario.state.replaceAll("_", " ")}</dd></div><div><dt>Expected behavior</dt><dd>{toolLabel(scenario.expectedTools)}</dd></div><div><dt>Authority boundary</dt><dd>{scenario.expectedBoundary}</dd></div></dl>
      </article>
    </div>
    <ol className="rehearsal-flow" aria-label="Live rehearsal data flow"><li><span>01</span><strong>Fixed synthetic prompt</strong><small>No free text or patient data</small></li><li><span>02</span><strong>Cloud tool selection</strong><small>gpt-oss:120b-cloud</small></li><li><span>03</span><strong>Contract comparison</strong><small>Name and arguments only</small></li><li><span>04</span><strong>No execution</strong><small>No workflow state change</small></li></ol>
    {view.state === "running" && <div className="rehearsal-progress" aria-hidden="true"><div className="progress-track"><span /></div><p>Elapsed {elapsedSeconds}s · automatic stop by {Math.max(0, liveAgentRehearsalContract.timeoutMs / 1_000 - elapsedSeconds)}s</p></div>}
    {view.receipt && <div className="rehearsal-receipt">
      <div className="rehearsal-verdict"><span aria-hidden="true" /><div><small>Live verdict</small><strong>{view.receipt.state === "passed" ? "Expected selection" : view.receipt.state === "finding" ? "Selection finding" : "Model unavailable"}</strong></div></div>
      <dl><div><dt>Expected</dt><dd>{toolLabel(view.receipt.expectedTools)}</dd></div><div><dt>Selected</dt><dd>{toolLabel(view.receipt.selectedTools)}</dd></div><div><dt>Arguments</dt><dd>{view.receipt.expectedAbstention ? "Not applicable" : view.receipt.argumentsChecked ? "Schema valid" : "Finding"}</dd></div><div><dt>Latency</dt><dd>{view.receipt.latencyMs} ms</dd></div><div><dt>Provider</dt><dd>{view.receipt.reportedModel ?? "Not reported"}</dd></div><div><dt>Tool execution</dt><dd>None</dd></div></dl>
      {view.receipt.findingCodes.length > 0 && <p><strong>Finding codes</strong>{view.receipt.findingCodes.map((code) => <code key={code}>{code}</code>)}</p>}
    </div>}
    <p className="rehearsal-status" role="status" aria-atomic="true">{statusText}</p>
    <div className="rehearsal-actions">{view.state === "running" ? <button type="button" onClick={cancelRehearsal}>Cancel rehearsal</button> : <button className="primary-action" type="button" onClick={() => void runRehearsal()}>{view.state === "idle" ? "Run selected rehearsal" : "Run selected again"}</button>}<small>3 shared cloud checks per 10 minutes · fixed input · no persistence</small></div>
    {canRunFixedPublicExecution && <section className={`fixed-public-execution execution-${publicExecution.state}`} aria-labelledby="fixed-public-execution-title" aria-busy={publicExecution.state === "running"}>
      <div className="fixed-execution-heading"><div><span>Optional second proof</span><strong id="fixed-public-execution-title">Execute the selected public capability in this browser</strong><p>The model has selected the expected tool. A separate click now asks <code>document.modelContext.executeTool()</code> to run only the fixed public condition <strong>胃癌</strong>; no note, profile, or free text is available.</p></div><b>{publicExecution.state === "idle" ? "Not run" : publicExecution.state.replaceAll("_", " ")}</b></div>
      {publicExecution.receipt && <div className="fixed-execution-receipt">
        <dl><div><dt>Browser API</dt><dd>executeTool()</dd></div><div><dt>Input profile</dt><dd>{publicExecution.receipt.compatibilityProfile.replaceAll("_", " ")}</dd></div><div><dt>Public records</dt><dd>{publicExecution.receipt.recordCount}</dd></div><div><dt>Coverage</dt><dd>{publicExecution.receipt.completeness}</dd></div></dl>
        <p><strong>Query bridge</strong><span>TFDA: {publicExecution.receipt.registryConditions.TFDA}</span><span>ClinicalTrials.gov: {publicExecution.receipt.registryConditions["ClinicalTrials.gov"]}</span></p>
        {publicExecution.receipt.records.length > 0 && <ol>{publicExecution.receipt.records.map((record, index) => <li key={`${record.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{record.title}</strong><small>{record.region ?? "Region not published"}</small></li>)}</ol>}
      </div>}
      <p className="fixed-execution-status" role="status" aria-atomic="true">{publicExecutionStatus}</p>
      <div className="fixed-execution-actions">{publicExecution.state === "running" ? <button type="button" onClick={cancelFixedPublicExecution}>Cancel public execution</button> : <button className="primary-action" type="button" onClick={() => void runFixedPublicExecution()}>{publicExecution.state === "idle" ? "Execute fixed public search" : "Run fixed search again"}</button>}<small>Fixed 胃癌 input · read-only · up to 25 seconds · volatile result</small></div>
      <p className="fixed-execution-boundary"><strong>Evidence boundary:</strong> this is a site-orchestrated, fixed-input browser execution following a separate model-selection pass. It proves the browser API path without claiming that Inspector or an external agent initiated the call.</p>
    </section>}
    <p className="rehearsal-boundary"><strong>Evidence boundary:</strong> this is live model-to-tool selection evidence. It does not execute WebMCP, inspect the current browser, replace Model Context Tool Inspector, or establish clinical accuracy.</p>
  </section>;
}
