"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  liveAgentRehearsalContract,
  liveAgentRehearsalScenarios,
  type LiveAgentRehearsalReceipt,
  type LiveAgentRehearsalScenarioId,
} from "@/lib/webmcp/liveRehearsalContract";

type RehearsalView = {
  state: "idle" | "running" | "passed" | "finding" | "unavailable" | "cancelled";
  receipt?: LiveAgentRehearsalReceipt;
  error?: string;
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
  const controllerRef = useRef<AbortController | null>(null);
  const scenario = useMemo(() => liveAgentRehearsalScenarios.find((item) => item.id === selectedId) ?? liveAgentRehearsalScenarios[0], [selectedId]);

  useEffect(() => {
    if (view.state !== "running") return;
    setElapsedSeconds(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [view.state]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  function chooseScenario(id: LiveAgentRehearsalScenarioId) {
    if (view.state === "running") return;
    setSelectedId(id);
    setView({ state: "idle" });
  }

  async function runRehearsal() {
    if (view.state === "running") return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setView({ state: "running" });
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

  const statusText = view.state === "idle" ? "Ready. No model request has been sent."
    : view.state === "running" ? "gpt-oss:120b-cloud is choosing from the tools available in this synthetic page state."
      : view.state === "passed" ? "Pass. The model selected the expected capability and valid synthetic arguments."
        : view.state === "finding" ? "Finding. The selected capability or arguments differed from the fixed expectation."
          : view.state === "cancelled" ? "Rehearsal cancelled. No tool was executed and no result was stored."
            : `Rehearsal unavailable. ${view.error ?? "Review the finding codes or try again later."}`;

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
    <p className="rehearsal-boundary"><strong>Evidence boundary:</strong> this is live model-to-tool selection evidence. It does not execute WebMCP, inspect the current browser, replace Model Context Tool Inspector, or establish clinical accuracy.</p>
  </section>;
}
