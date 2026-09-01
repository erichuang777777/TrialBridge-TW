import Link from "next/link";
import { WebMcpDiagnostics } from "./_components/WebMcpDiagnostics";

const tools = [
  { name: "search_public_trial_form", kind: "Declarative", availability: "Visible on /trials", boundary: "Public condition only" },
  { name: "trialbridge_method", kind: "Imperative", availability: "Always public", boundary: "No patient context" },
  { name: "search_public_cancer_trials", kind: "Imperative", availability: "Always public", boundary: "Read-only · untrusted registry output" },
  { name: "explain_confirmed_matches", kind: "Imperative", availability: "Permission-gated", boundary: "Confirmed, de-identified context only" },
  { name: "draft_trial_outreach", kind: "Imperative", availability: "Permission-gated", boundary: "Creates an unsent draft" },
];

export default function WebMcpProofPage() {
  return <main className="webmcp-proof-page" id="main-content" tabIndex={-1}>
    <header className="proof-header">
      <Link className="back-link" href="/">← Back home</Link>
      <p className="eyebrow">Competition evidence</p>
      <h1>WebMCP, visible and testable.</h1>
      <p className="lead">TrialBridge TW combines one declarative form tool with four imperative tools. The human interface remains complete when WebMCP is unavailable, while compatible browser agents receive typed, origin-scoped, read-only capabilities.</p>
      <div className="proof-summary" aria-label="WebMCP implementation summary"><span><strong>1</strong> declarative tool</span><span><strong>4</strong> imperative tools</span><span><strong>1,500</strong> character output cap</span><span><strong>0</strong> send or enrollment tools</span></div>
    </header>

    <WebMcpDiagnostics />

    <section className="proof-section" aria-labelledby="tool-inventory-title">
      <div className="proof-section-heading"><p className="eyebrow">Capability inventory</p><h2 id="tool-inventory-title">The site declares exactly what an agent may do.</h2></div>
      <div className="tool-inventory" role="list">{tools.map((tool) => <article key={tool.name} role="listitem"><div><code>{tool.name}</code><span>{tool.kind}</span></div><strong>{tool.availability}</strong><p>{tool.boundary}</p></article>)}</div>
    </section>

    <section className="proof-section proof-guardrails" aria-labelledby="guardrails-title">
      <div className="proof-section-heading"><p className="eyebrow">Authority boundary</p><h2 id="guardrails-title">Useful enough to navigate. Constrained enough to trust.</h2></div>
      <div className="method-proof-grid"><article><strong>Data minimized</strong><p>Raw and masked notes never enter a WebMCP schema or result.</p></article><article><strong>Evidence marked</strong><p>Registry-derived results carry an untrusted-content annotation and source links.</p></article><article><strong>No consequential writes</strong><p>No tool can enroll, send, book, consent, or change treatment.</p></article></div>
    </section>

    <aside className="proof-next-step" aria-label="Judge verification boundary"><strong>Final judge gate</strong><p>This page proves the implementation and current-browser lifecycle. Natural-language tool selection and permission transitions must still be demonstrated in Chrome Model Context Tool Inspector.</p><div><Link href="/trials">Try the declarative trial form</Link><a href="https://developer.chrome.com/docs/ai/webmcp" target="_blank" rel="noreferrer">Open Chrome WebMCP documentation</a><a href="https://github.com/erichuang777777/TrialBridge-TW/actions" target="_blank" rel="noreferrer">View GitHub CI evidence</a></div></aside>
  </main>;
}
