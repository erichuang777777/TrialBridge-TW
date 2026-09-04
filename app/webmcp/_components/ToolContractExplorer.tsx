"use client";

import { useMemo, useState } from "react";
import { webMcpToolContractBundle, webMcpToolContractCatalog, type WebMcpAvailabilityGroup } from "@/lib/webmcp/toolContractCatalog";

type ContractFilter = "all" | WebMcpAvailabilityGroup;

const filters: Array<{ value: ContractFilter; label: string }> = [
  { value: "all", label: "All tools" },
  { value: "public", label: "Public" },
  { value: "intake", label: "Intake-gated" },
  { value: "permission", label: "Permission-gated" },
  { value: "shortlist", label: "Shortlist" },
];

export function ToolContractExplorer() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ContractFilter>("all");
  const [activity, setActivity] = useState("No contract has been copied.");
  const filteredContracts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");
    return webMcpToolContractCatalog.filter((contract) => {
      if (filter !== "all" && contract.availabilityGroup !== filter) return false;
      if (!normalizedQuery) return true;
      const searchable = [
        contract.name, contract.title, contract.description, contract.availability, contract.boundary,
        contract.humanControl, contract.recovery, ...contract.parameters.flatMap((parameter) => [parameter.name, parameter.description]),
      ].join(" ").toLocaleLowerCase("en");
      return searchable.includes(normalizedQuery);
    });
  }, [filter, query]);

  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setActivity(successMessage);
    } catch {
      setActivity("Clipboard access was unavailable. Expand the contract and copy the visible JSON manually.");
    }
  }

  return <section className="proof-section tool-contract-explorer" aria-labelledby="tool-contract-title">
    <div className="tool-contract-heading">
      <div className="proof-section-heading">
        <p className="eyebrow">Canonical tool contracts</p>
        <h2 id="tool-contract-title">Inspect what every agent can—and cannot—call.</h2>
        <p>These are the same names, descriptions, JSON Schemas, and hints used by the visible declarative form and <code>registerTool()</code>. Search the catalog, inspect parameter limits, or copy a contract for review.</p>
      </div>
      <div className="tool-contract-score" aria-label={`${webMcpToolContractBundle.summary.withinChromeGuidance} of ${webMcpToolContractBundle.summary.tools} tool contracts within Chrome character guidance`}>
        <strong>{webMcpToolContractBundle.summary.withinChromeGuidance}/{webMcpToolContractBundle.summary.tools}</strong>
        <span>within budgets</span>
      </div>
    </div>

    <div className="tool-contract-summary" aria-label="Tool contract summary">
      <span><strong>{webMcpToolContractBundle.summary.declarative}</strong> visible declarative</span>
      <span><strong>{webMcpToolContractBundle.summary.imperative}</strong> typed imperative</span>
      <span><strong>{webMcpToolContractBundle.summary.readOnlyBehavior}</strong> read-only behavior</span>
      <span><strong>{webMcpToolContractBundle.summary.writeAuthority}</strong> write authority</span>
    </div>

    <div className="tool-contract-controls">
      <label htmlFor="tool-contract-search">Find a tool, parameter, or boundary</label>
      <div className="tool-contract-search-row">
        <input id="tool-contract-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try shortlist, language, registry…" />
        {query && <button type="button" onClick={() => setQuery("")}>Clear</button>}
      </div>
      <div className="tool-contract-filters" role="group" aria-label="Filter tool contracts by availability">
        {filters.map((item) => {
          const count = item.value === "all" ? webMcpToolContractCatalog.length : webMcpToolContractCatalog.filter((contract) => contract.availabilityGroup === item.value).length;
          return <button type="button" key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label} <span>{count}</span></button>;
        })}
      </div>
    </div>

    <p className="tool-contract-result-status" role="status" aria-atomic="true">{filteredContracts.length} of {webMcpToolContractCatalog.length} tool contracts shown. {activity}</p>

    {filteredContracts.length === 0 ? <div className="tool-contract-empty"><strong>No contract matches this view.</strong><p>Clear the search or choose another availability filter.</p><button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Show all tools</button></div> : <div className="tool-contract-list">
      {filteredContracts.map((contract) => <details className="tool-contract" key={contract.name}>
        <summary>
          <span className={`tool-contract-kind kind-${contract.kind.toLocaleLowerCase("en")}`}>{contract.kind}</span>
          <span className="tool-contract-name"><code>{contract.name}</code><small>{contract.title}</small></span>
          <span className="tool-contract-availability">{contract.availability}</span>
          <span className="tool-contract-chevron" aria-hidden="true">+</span>
        </summary>
        <div className="tool-contract-body">
          <p className="tool-contract-description">{contract.description}</p>
          <div className="tool-contract-boundaries">
            <article><span>Data boundary</span><strong>{contract.boundary}</strong></article>
            <article><span>Human control</span><strong>{contract.humanControl}</strong></article>
            <article><span>Recovery</span><strong>{contract.recovery}</strong></article>
            <article><span>Output trust</span><strong>{contract.untrustedOutput ? "Externally sourced · treat as untrusted" : "Authoritative product method"}</strong></article>
          </div>

          <div className="tool-contract-hints" aria-label={`Security and budget profile for ${contract.name}`}>
            <span><b>Read only</b> {contract.readOnlyBehavior ? "Yes" : `No · ${contract.stateEffect ?? "changes visible page state"}`}</span>
            <span><b>readOnlyHint</b> {contract.browserHints ? String(contract.browserHints.readOnlyHint) : "Declarative form"}</span>
            <span><b>untrustedContentHint</b> {contract.browserHints ? String(contract.browserHints.untrustedContentHint) : "Not exposed by form markup"}</span>
            <span><b>Name</b> {contract.budgets.nameCharacters}/30</span>
            <span><b>Description</b> {contract.budgets.descriptionCharacters}/500</span>
            <span><b>Output cap</b> {contract.budgets.outputCharacterLimit}/1500</span>
          </div>

          <section className="tool-contract-parameters" aria-labelledby={`${contract.name}-parameters`}>
            <div><h3 id={`${contract.name}-parameters`}>Input parameters</h3><span>{contract.parameters.length === 0 ? "No input" : `${contract.parameters.length} parameter${contract.parameters.length === 1 ? "" : "s"}`}</span></div>
            {contract.parameters.length === 0 ? <p>This tool accepts an empty object and rejects additional properties.</p> : <ul>{contract.parameters.map((parameter) => <li key={parameter.name}>
              <div><code>{parameter.name}</code><span>{parameter.type}</span>{parameter.required && <b>Required</b>}</div>
              <p>{parameter.description}</p>
              {parameter.enum && <small>Allowed: {parameter.enum.join(" · ")}</small>}
            </li>)}</ul>}
          </section>

          <div className="tool-contract-schema">
            <div><strong>Exact JSON Schema</strong><small>additionalProperties: false</small></div>
            <pre>{JSON.stringify(contract.inputSchema, null, 2)}</pre>
          </div>
          <div className="tool-contract-actions">
            <button type="button" onClick={() => void copyText(JSON.stringify(contract.inputSchema, null, 2), `${contract.name} JSON Schema copied.`)}>Copy JSON Schema</button>
            <button type="button" onClick={() => void copyText(JSON.stringify(contract, null, 2), `${contract.name} full contract copied.`)}>Copy full contract</button>
            <small>Source: <code>{contract.sourceFile}</code></small>
          </div>
        </div>
      </details>)}
    </div>}

    <div className="tool-contract-download">
      <div><strong>Download all {webMcpToolContractCatalog.length} contracts</strong><p>Static implementation metadata only—no browser session, note, profile, results, chat, or tool output. This is a review artifact, not a protocol endpoint.</p></div>
      <a className="secondary-action action-link" href="/webmcp/contracts.json" download={`trialbridge-webmcp-tool-contracts-${webMcpToolContractBundle.auditedAt}.json`}>Download contracts JSON</a>
    </div>
  </section>;
}
