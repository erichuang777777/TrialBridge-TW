"use client";

import { useMemo, useState } from "react";
import {
  createWebMcpInspectorAcceptanceReceipt,
  type InspectorAcceptanceOutcome,
  webMcpInspectorAcceptanceCases,
} from "@/lib/webmcp/inspectorAcceptance";
import { webMcpLocalTestingFlag } from "@/lib/webmcp/browserSetup";

type OutcomeMap = Partial<Record<(typeof webMcpInspectorAcceptanceCases)[number]["id"], InspectorAcceptanceOutcome>>;

function chromeMajorVersion() {
  const match = navigator.userAgent.match(/(?:Chrome|CriOS)\/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

export function InspectorAcceptanceKit() {
  const [outcomes, setOutcomes] = useState<OutcomeMap>({});
  const [activity, setActivity] = useState("Results stay in this tab until you download or leave the page.");
  const [downloaded, setDownloaded] = useState(false);
  const completed = useMemo(
    () => webMcpInspectorAcceptanceCases.filter((item) => (outcomes[item.id] ?? "not_run") !== "not_run").length,
    [outcomes],
  );

  function recordOutcome(id: (typeof webMcpInspectorAcceptanceCases)[number]["id"], outcome: Exclude<InspectorAcceptanceOutcome, "not_run">) {
    const isClearing = outcomes[id] === outcome;
    setOutcomes((current) => ({ ...current, [id]: isClearing ? "not_run" : outcome }));
    setDownloaded(false);
    setActivity(isClearing ? "Check returned to Not run." : outcome === "pass" ? "Check recorded as Pass." : "Check recorded as Needs attention.");
  }

  async function copyPrompt(prompt: string, title: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setActivity(`${title} prompt copied. Paste it into Inspector.`);
    } catch {
      setActivity("Clipboard access was unavailable. Select the visible prompt and copy it manually.");
    }
  }

  function downloadReceipt() {
    const generatedAt = new Date().toISOString();
    const receipt = createWebMcpInspectorAcceptanceReceipt({
      generatedAt,
      origin: location.origin,
      chromeMajor: chromeMajorVersion(),
      outcomes,
    });
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(receipt, null, 2)}\n`], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `trialbridge-inspector-manual-${generatedAt.slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setDownloaded(true);
    setActivity(`Manual receipt downloaded with ${completed} of ${webMcpInspectorAcceptanceCases.length} checks recorded.`);
  }

  return <section className="proof-section inspector-acceptance-kit" aria-labelledby="inspector-kit-title">
    <div className="inspector-kit-heading">
      <div className="proof-section-heading">
        <p className="eyebrow">Manual Chrome gate</p>
        <h2 id="inspector-kit-title">Run the same six Inspector checks, in order.</h2>
        <p>The kit supplies fixed prompts and expected boundaries, but only you can mark what Chrome actually showed. Its download is explicitly self-attested—not automatic proof.</p>
      </div>
      <div className="inspector-kit-progress" aria-label={`${completed} of ${webMcpInspectorAcceptanceCases.length} manual checks recorded`}>
        <strong>{completed}/{webMcpInspectorAcceptanceCases.length}</strong>
        <span>recorded</span>
      </div>
    </div>

    <div className="inspector-setup-note">
      <strong>Before starting</strong>
      <p>Chrome 146 or later · enable built-in WebMCP in <code>{webMcpLocalTestingFlag}</code> · relaunch · install the separate Model Context Tool Inspector only for this manual judge gate. Use only the fictional case for protected-state checks.</p>
      <a href="https://developer.chrome.com/docs/ai/webmcp" target="_blank" rel="noreferrer">Open official setup guide</a>
    </div>

    <div className="inspector-case-list">
      {webMcpInspectorAcceptanceCases.map((item) => {
        const outcome = outcomes[item.id] ?? "not_run";
        const outcomeLabel = outcome === "pass" ? "Pass" : outcome === "needs_attention" ? "Needs attention" : "Not run";
        return <details className="inspector-case" data-outcome={outcome} key={item.id}>
          <summary>
            <span className="inspector-case-number">{item.number}</span>
            <span className="inspector-case-title"><small>{item.category}</small><strong>{item.title}</strong></span>
            <span className="inspector-case-state"><i aria-hidden="true" />{outcomeLabel}</span>
          </summary>
          <div className="inspector-case-body">
            <dl>
              <div><dt>Setup</dt><dd>{item.setup}</dd></div>
              <div><dt>Action</dt><dd>{item.action}</dd></div>
              <div><dt>Expected</dt><dd>{item.expected}</dd></div>
            </dl>
            {item.prompt && <div className="inspector-prompt">
              <div><span>Fixed no-PHI prompt</span><code>{item.prompt}</code></div>
              <button type="button" onClick={() => void copyPrompt(item.prompt!, item.title)}>Copy prompt</button>
            </div>}
            <div className="inspector-outcome-controls" role="group" aria-label={`Record outcome for ${item.title}`}>
              <span>What Chrome showed</span>
              <button type="button" aria-pressed={outcome === "pass"} onClick={() => recordOutcome(item.id, "pass")}>Pass</button>
              <button type="button" aria-pressed={outcome === "needs_attention"} onClick={() => recordOutcome(item.id, "needs_attention")}>Needs attention</button>
            </div>
          </div>
        </details>;
      })}
    </div>

    <div className="inspector-kit-download">
      <div><strong>Download a manual acceptance receipt</strong><p>Stores case IDs, outcomes, origin, Chrome major version, and counts only. No prompts, tool payloads, medical data, or browser storage.</p></div>
      <button className="secondary-action" type="button" onClick={downloadReceipt}>{downloaded ? "Downloaded" : "Download manual JSON"}</button>
    </div>
    <p className="inspector-kit-status" role="status" aria-atomic="true">{completed} of {webMcpInspectorAcceptanceCases.length} checks recorded. {activity}</p>
  </section>;
}
