"use client";

import { useEffect, useRef, useState } from "react";
import type { CompetitionPreflightReceipt } from "@/lib/demo/preflight";

type PreflightView = {
  state: "idle" | "running" | "ready" | "partial" | "unavailable" | "cancelled";
  receipt?: CompetitionPreflightReceipt;
  error?: string;
};

const registryNames = ["TFDA", "ClinicalTrials.gov"] as const;

export function CompetitionPreflight() {
  const [view, setView] = useState<PreflightView>({ state: "idle" });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (view.state !== "running") return;
    setElapsedSeconds(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [view.state]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function runPreflight() {
    if (view.state === "running") return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setView({ state: "running" });
    try {
      const response = await fetch("/api/demo/preflight", { method: "POST", signal: controller.signal });
      const payload = await response.json() as Partial<CompetitionPreflightReceipt> & { error?: string };
      if ((payload.status === "ready" || payload.status === "partial" || payload.status === "unavailable")
        && payload.containsHealthInformation === false
        && payload.storesModelContent === false
        && payload.returnsTrialRecords === false
        && payload.persisted === false
        && payload.cloud
        && payload.registries) {
        setView({ state: payload.status, receipt: payload as CompetitionPreflightReceipt });
        return;
      }
      throw new Error(payload.error ?? "Demo preflight returned an invalid metadata receipt.");
    } catch (error) {
      if (controller.signal.aborted) setView({ state: "cancelled" });
      else setView({ state: "unavailable", error: error instanceof Error ? error.message : "Demo preflight failed." });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  function cancelPreflight() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setView({ state: "cancelled" });
  }

  const statusText = view.state === "idle" ? "Not run. No cloud or registry request has been sent."
    : view.state === "running" ? "Checking the cloud model and both public registries in parallel."
      : view.state === "ready" ? "Demo dependencies ready: cloud, TFDA, and ClinicalTrials.gov responded."
        : view.state === "partial" ? "Demo preflight is partial. Review the unavailable dependency before presenting."
          : view.state === "cancelled" ? "Demo preflight cancelled. No authored or patient content was used."
            : `Demo preflight unavailable. ${view.error ?? "Retry before presenting."}`;

  return <section className={`competition-preflight preflight-${view.state}`} aria-labelledby="competition-preflight-title" aria-busy={view.state === "running"}>
    <div className="preflight-heading"><div><p className="eyebrow">Optional live readiness check</p><h2 id="competition-preflight-title">Know whether the demo path is ready before entering it.</h2><p>One body-free request checks <code>gpt-oss:120b-cloud</code>, TFDA, and ClinicalTrials.gov with fixed synthetic input. The receipt returns metadata only—never trial records, model content, or health information.</p></div><span>{view.state === "idle" ? "Not run" : view.state}</span></div>
    {view.state === "running" && <div className="preflight-progress" aria-hidden="true"><div className="progress-track"><span /></div><p>Elapsed {elapsedSeconds}s · automatic stop by {Math.max(0, 30 - elapsedSeconds)}s</p></div>}
    {view.receipt && <div className="preflight-results" role="list">
      <article className={`preflight-result result-${view.receipt.cloud.state}`} role="listitem"><div><span aria-hidden="true" /><strong>gpt-oss cloud</strong><b>{view.receipt.cloud.state}</b></div>{view.receipt.cloud.state === "ready" ? <dl><div><dt>Provider</dt><dd>{view.receipt.cloud.reportedModel}</dd></div><div><dt>Latency</dt><dd>{view.receipt.cloud.latencyMs} ms</dd></div></dl> : <p>{view.receipt.cloud.code}</p>}</article>
      {registryNames.map((registry) => {
        const source = view.receipt!.registries.sources.find((item) => item.registry === registry);
        const failure = view.receipt!.registries.failures.find((item) => item.registry === registry);
        return <article className={`preflight-result result-${source ? "ready" : "unavailable"}`} role="listitem" key={registry}><div><span aria-hidden="true" /><strong>{registry}</strong><b>{source ? "ready" : "unavailable"}</b></div>{source ? <dl><div><dt>Records found</dt><dd>{source.count}</dd></div><div><dt>Source state</dt><dd>{source.dataState.mode.replaceAll("_", " ")}</dd></div><div><dt>Latency</dt><dd>{source.durationMs} ms</dd></div></dl> : <p>{failure?.code ?? "SOURCE_UNAVAILABLE"}{failure ? ` · ${failure.durationMs} ms` : ""}</p>}</article>;
      })}
    </div>}
    {view.receipt && <p className="preflight-receipt-line"><strong>{view.receipt.latencyMs} ms total</strong><span>{new Date(view.receipt.checkedAt).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC · no persistence · no records returned</span></p>}
    <p className="preflight-status" role="status" aria-atomic="true">{statusText}</p>
    <div className="preflight-actions">{view.state === "running" ? <button type="button" onClick={cancelPreflight}>Cancel preflight</button> : <button className="primary-action" type="button" onClick={() => void runPreflight()}>{view.state === "idle" ? "Run demo preflight" : "Run again"}</button>}<small>Maximum 3 shared cloud checks per 10 minutes · fixed input · 30-second hard limit</small></div>
    <p className="preflight-boundary"><strong>Evidence boundary:</strong> readiness metadata does not prove WebMCP Inspector behavior, trial eligibility, registry completeness, or clinical validity.</p>
  </section>;
}
