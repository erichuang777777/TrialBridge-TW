import Link from "next/link";
import { WebMcpDiagnostics } from "./_components/WebMcpDiagnostics";
import selectionBaseline from "../../evals/webmcp-selection-baseline.json";

const tools = [
  { name: "search_public_trial_form", kind: "Declarative", availability: "Visible on /trials", boundary: "Public condition only" },
  { name: "trialbridge_method", kind: "Imperative", availability: "Always public", boundary: "No patient context" },
  { name: "search_public_cancer_trials", kind: "Imperative", availability: "Always public", boundary: "Read-only · untrusted registry output" },
  { name: "review_trial_followups", kind: "Imperative", availability: "Permission-gated", boundary: "Questions only · never records answers" },
  { name: "explain_confirmed_matches", kind: "Imperative", availability: "Permission-gated", boundary: "Confirmed, de-identified context only" },
  { name: "draft_trial_outreach", kind: "Imperative", availability: "Permission-gated", boundary: "Creates an unsent draft" },
  { name: "draft_trial_discussion_brief", kind: "Imperative", availability: "Permission-gated", boundary: "Local care-team brief · never sent" },
  { name: "compare_shortlisted_trials", kind: "Imperative", availability: "2–3 visible selections", boundary: "Reads only the user-controlled shortlist" },
];

const baselineJourneyCount = selectionBaseline.summary.samples / selectionBaseline.repetitions;

const baselineIntentCopy = [
  { key: "direct", label: "Direct", description: "Clear requests selected the expected read-only capability." },
  { key: "ambiguous", label: "Ambiguous", description: "Natural phrasing still separated search, outreach, and care-team briefs." },
  { key: "recovery", label: "Recovery", description: "Pending-information state selected the question-review tool." },
  { key: "forbidden", label: "Forbidden", description: "Enrollment and raw-note requests safely selected no tool." },
] as const;

export default function WebMcpProofPage() {
  return <main className="webmcp-proof-page" id="main-content" tabIndex={-1}>
    <header className="proof-header">
      <Link className="back-link" href="/">← Back home</Link>
      <p className="eyebrow">Competition evidence</p>
      <h1>WebMCP, visible and testable.</h1>
      <p className="lead">TrialBridge TW combines one declarative form tool with up to seven imperative tools. The human interface remains complete when WebMCP is unavailable, while compatible browser agents receive typed, origin-scoped, read-only capabilities that follow visible page state.</p>
      <div className="proof-summary" aria-label="WebMCP implementation summary"><span><strong>1</strong> declarative tool</span><span><strong>7</strong> maximum imperative tools</span><span><strong>{baselineJourneyCount}</strong> journey eval cases</span><span><strong>0</strong> send or enrollment tools</span></div>
    </header>

    <WebMcpDiagnostics />

    <section className="proof-section selection-evidence" aria-labelledby="selection-evidence-title">
      <div className="selection-evidence-heading">
        <div className="proof-section-heading"><p className="eyebrow">Recorded cloud-model baseline</p><h2 id="selection-evidence-title">Tool selection tested beyond static schemas.</h2><p>{selectionBaseline.repetitions} repetitions of {baselineJourneyCount} synthetic journeys were sent through the localhost Ollama proxy to <code>{selectionBaseline.requestedModel}</code>. The artifact stores tool calls, arguments, latency, and pass/fail only—not response content or model thinking.</p></div>
        <div className="selection-score" aria-label={`${selectionBaseline.summary.passed} of ${selectionBaseline.summary.samples} recorded samples passed`}><strong>{selectionBaseline.summary.passed}/{selectionBaseline.summary.samples}</strong><span>recorded pass</span></div>
      </div>
      <div className="selection-intent-grid" role="list" aria-label="Selection baseline by intent">
        {baselineIntentCopy.map((intent) => {
          const result = selectionBaseline.summary.byIntent[intent.key];
          return <article key={intent.key} role="listitem" className={`selection-intent selection-${intent.key}`}>
            <div><h3>{intent.label}</h3><strong>{result.passed}/{result.samples}</strong></div>
            <div className="selection-meter" role="img" aria-label={`${intent.label}: ${result.passed} of ${result.samples} passed`}><span style={{ width: `${(result.passed / result.samples) * 100}%` }} /></div>
            <p>{intent.description}</p>
          </article>;
        })}
      </div>
      <div className="selection-boundaries">
        <article><span>What this records</span><strong>Single-turn model-to-tool selection</strong><p>Expected tool name, synthetic arguments, safe abstention, model identity, and latency across {selectionBaseline.summary.samples} calls.</p></article>
        <article><span>What remains separate</span><strong>Chrome Inspector and clinical validation</strong><p>This does not execute tools or prove browser registration, permissions, multi-turn recovery, clinical safety, fairness, or eligibility accuracy.</p></article>
      </div>
      <div className="selection-receipt"><p><strong>Recorded {selectionBaseline.evaluatedAt.slice(0, 10)} UTC</strong><span>Dataset <code>{selectionBaseline.datasetDigestSha256.slice(0, 12)}…</code> · Tool contract <code>{selectionBaseline.toolContractDigestSha256.slice(0, 12)}…</code></span></p><a href="https://github.com/erichuang777777/TrialBridge-TW/blob/main/evals/webmcp-selection-baseline.json" target="_blank" rel="noreferrer">Inspect the full JSON artifact</a></div>
    </section>

    <section className="proof-section" aria-labelledby="tool-inventory-title">
      <div className="proof-section-heading"><p className="eyebrow">Capability inventory</p><h2 id="tool-inventory-title">The site declares exactly what an agent may do.</h2></div>
      <div className="tool-inventory" role="list">{tools.map((tool) => <article key={tool.name} role="listitem"><div><code>{tool.name}</code><span>{tool.kind}</span></div><strong>{tool.availability}</strong><p>{tool.boundary}</p></article>)}</div>
    </section>

    <section className="proof-section proof-guardrails" aria-labelledby="guardrails-title">
      <div className="proof-section-heading"><p className="eyebrow">Authority boundary</p><h2 id="guardrails-title">Useful enough to navigate. Constrained enough to trust.</h2></div>
      <div className="method-proof-grid"><article><strong>Data minimized</strong><p>Raw and masked notes never enter a WebMCP schema or result.</p></article><article><strong>Visible state controls capability</strong><p>Question recovery follows pending state; shortlist comparison appears only after two user selections.</p></article><article><strong>No consequential writes</strong><p>No tool can enroll, send, book, consent, or change treatment.</p></article></div>
    </section>

    <aside className="proof-next-step" aria-label="Judge verification boundary"><strong>Final judge gate</strong><p>This page proves the implementation and current-browser lifecycle. Natural-language tool selection and permission transitions must still be demonstrated in Chrome Model Context Tool Inspector.</p><div><Link href="/trials">Try the declarative trial form</Link><a href="https://developer.chrome.com/docs/ai/webmcp" target="_blank" rel="noreferrer">Open Chrome WebMCP documentation</a><a href="https://github.com/erichuang777777/TrialBridge-TW/actions" target="_blank" rel="noreferrer">View GitHub CI evidence</a></div></aside>
  </main>;
}
