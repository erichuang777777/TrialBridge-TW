"use client";

import { useState } from "react";
import { webMcpCapabilityStates, type WebMcpCapabilityStateKey } from "@/lib/webmcp/capabilityStates";
import { webMcpToolContractCatalog } from "@/lib/webmcp/toolContractCatalog";

const imperativeContracts = webMcpToolContractCatalog.filter((tool) => tool.kind === "Imperative");

export function CapabilityStateSimulator() {
  const [selectedKey, setSelectedKey] = useState<WebMcpCapabilityStateKey>("public");
  const selected = webMcpCapabilityStates.find((state) => state.key === selectedKey) ?? webMcpCapabilityStates[0];
  const activeNames = new Set<string>(selected.activeImperativeToolNames);

  return <section className="proof-section capability-state-simulator" aria-labelledby="capability-state-title">
    <div className="capability-state-heading">
      <div className="proof-section-heading">
        <p className="eyebrow">State-scoped capability simulator</p>
        <h2 id="capability-state-title">See why the agent&apos;s tool set changes with human action.</h2>
        <p>Switch between {webMcpCapabilityStates.length} synthetic page states. The model makes no request, reads no medical workflow, and is tested against the same runtime function that registers TrialBridge tools.</p>
      </div>
      <div className="capability-state-score" aria-label={`${selected.activeImperativeToolNames.length} of ${imperativeContracts.length} imperative tools active`}>
        <strong>{selected.activeImperativeToolNames.length}/{imperativeContracts.length}</strong>
        <span>imperative active</span>
      </div>
    </div>

    <div className="capability-state-selector" role="group" aria-label="Choose a synthetic capability state">
      {webMcpCapabilityStates.map((state) => <button type="button" key={state.key} aria-pressed={state.key === selected.key} onClick={() => setSelectedKey(state.key)}>
        <span>{state.step}</span><strong>{state.shortLabel}</strong><small>{state.activeImperativeToolNames.length}/{imperativeContracts.length}</small>
      </button>)}
    </div>

    <p className="capability-state-status" role="status" aria-atomic="true">State {selected.step} of {webMcpCapabilityStates.length}: {selected.activeImperativeToolNames.length} of {imperativeContracts.length} imperative tools register. The public declarative form stays on /trials; the note-step form appears only with agent intake permission.</p>

    <div className="capability-state-board">
      <article className="capability-state-context">
        <p className="eyebrow">Visible human state</p>
        <h3>{selected.title}</h3>
        <dl>
          <div><dt>Human action</dt><dd>{selected.humanAction}</dd></div>
          <div><dt>Page state</dt><dd>{selected.visibleState}</dd></div>
          <div><dt>Registration effect</dt><dd>{selected.registrationEffect}</dd></div>
          <div><dt>Why it matters</dt><dd>{selected.whyItMatters}</dd></div>
        </dl>
        <p className="capability-state-boundary"><strong>Synthetic model only.</strong> No tool is executed and no health information is created, read, or stored.</p>
      </article>

      <div className="capability-state-tools" aria-label={`Tool registration in ${selected.title}`}>
        <div className="capability-state-tool-heading"><strong>Imperative registration</strong><span>{selected.activeImperativeToolNames.length} registered · {imperativeContracts.length - selected.activeImperativeToolNames.length} not registered</span></div>
        <ul>{imperativeContracts.map((tool) => {
          const active = activeNames.has(tool.name);
          return <li key={tool.name} className={active ? "is-registered" : "is-locked"}>
            <span className="capability-state-indicator" aria-hidden="true" />
            <div><code>{tool.name}</code><small>{active ? "Registered in this state" : `Not registered · ${tool.availability}`}</small></div>
            <strong>{active ? "Active" : "Locked"}</strong>
          </li>;
        })}</ul>
      </div>
    </div>
  </section>;
}
