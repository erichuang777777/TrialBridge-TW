import type { Metadata } from "next";
import Link from "next/link";
import { createPageMetadata } from "@/lib/site/metadata";
import { webMcpCriticalJourney } from "@/lib/webmcp/criticalJourney";
import { webMcpImplementationLandscape } from "@/lib/webmcp/implementationLandscape";
import { webMcpConformanceMatrix, webMcpJudgeBundle } from "@/lib/webmcp/judgeBundle";
import { getWebMcpOriginTrialDeploymentState } from "@/lib/webmcp/originTrial";
import { webMcpSpecCrosswalk, webMcpSpecCrosswalkBundle } from "@/lib/webmcp/specCrosswalk";
import { WebMcpDiagnostics } from "./_components/WebMcpDiagnostics";
import { CompetitionPreflight } from "./_components/CompetitionPreflight";
import { InspectorAcceptanceKit } from "./_components/InspectorAcceptanceKit";
import { ToolContractExplorer } from "./_components/ToolContractExplorer";
import { CapabilityStateSimulator } from "./_components/CapabilityStateSimulator";
import { WebMcpBrowserSetup } from "./_components/WebMcpBrowserSetup";
import { LiveAgentRehearsal } from "./_components/LiveAgentRehearsal";
import selectionBaseline from "../../evals/webmcp-selection-baseline.json";

export const metadata: Metadata = createPageMetadata({
  title: "WebMCP Competition Evidence",
  description: "Inspect TrialBridge TW's declarative and imperative WebMCP capabilities, live browser diagnostics, tool-selection evidence, and authority boundaries.",
  path: "/webmcp",
});

const baselineJourneyCount = selectionBaseline.summary.samples / selectionBaseline.repetitions;

const baselineIntentCopy = [
  { key: "direct", label: "Direct", description: "Clear requests selected the expected read-only capability." },
  { key: "ambiguous", label: "Ambiguous", description: "Natural phrasing still separated search, outreach, and care-team briefs." },
  { key: "recovery", label: "Recovery", description: "Pending-information state selected the question-review tool." },
  { key: "forbidden", label: "Forbidden", description: "Enrollment and raw-note requests safely selected no tool." },
] as const;

const standardsProfile = [
  {
    label: "Declarative API",
    title: "The visible form is the tool",
    code: "toolname · toolparamdescription · respondWith()",
    detail: "The public registry form is compiled into a tool without creating a hidden agent-only workflow.",
  },
  {
    label: "Imperative API",
    title: "Typed capabilities follow page state",
    code: "registerTool() · getTools() · executeTool()",
    detail: "Public, confirmed-context, and shortlist tools are registered and removed as visible permission and selection state changes.",
  },
  {
    label: "Lifecycle compatibility",
    title: "Registration and execution both cancel cleanly",
    code: "toolchange · register signal · execute signal",
    detail: "The no-PHI live suite verifies browser lifecycle cleanup; product execution cancellation also reaches browser fetch, Next request, and each registry adapter.",
  },
  {
    label: "Origin security",
    title: "Tools stay inside the intended origin",
    code: "tools=(self) · exposedTo · annotations",
    detail: "Same-origin policy, explicit exposure, read-only hints, and untrusted-content hints constrain what agents can discover and trust.",
  },
] as const;

export default function WebMcpProofPage() {
  const originTrial = getWebMcpOriginTrialDeploymentState();
  const originTrialTitle = originTrial.status === "configured_unverified"
    ? `Token configured for ${originTrial.siteOrigin}`
    : originTrial.status === "misconfigured"
      ? "Origin Trial configuration needs attention"
      : "Local testing profile · no production token";
  const originTrialDetail = originTrial.status === "configured_unverified"
    ? "The first-party token is emitted before WebMCP code runs. Chrome DevTools validation and Inspector acceptance are still required before claiming production Origin Trial success."
    : originTrial.status === "misconfigured"
      ? "The token or SITE_URL does not meet the fail-closed deployment contract. No production readiness claim is made."
      : "The recorded 6/6 Chrome run used local testing features. Set one exact non-loopback HTTPS SITE_URL and its registered token during the production build.";
  return <main className="webmcp-proof-page" id="main-content" tabIndex={-1}>
    <header className="proof-header">
      <Link className="back-link" href="/">← Back home</Link>
      <p className="eyebrow">Competition evidence</p>
      <h1>WebMCP, visible and testable.</h1>
      <p className="lead">TrialBridge TW combines one declarative form tool with up to seven imperative tools. The human interface remains complete when WebMCP is unavailable, while compatible browser agents receive typed, origin-scoped, read-only capabilities that follow visible page state.</p>
      <p className="proof-quickstart-link"><Link className="primary-action action-link" href="/webmcp/quickstart">Open the three-minute judge demo</Link><span>New here? Start with the concise path, then return for the complete evidence appendix.</span></p>
      <div className="proof-summary" aria-label="WebMCP implementation summary"><span><strong>1</strong> declarative tool</span><span><strong>7</strong> maximum imperative tools</span><span><strong>{baselineJourneyCount}</strong> journey eval cases</span><span><strong>19</strong> bilingual cancer groups</span><span><strong>0</strong> send or enrollment tools</span></div>
      <aside className="recorded-runtime-proof" aria-label="Recorded Chrome WebMCP runtime evidence">
        <span><i aria-hidden="true" />Recorded Chrome evidence</span>
        <div><strong>{webMcpJudgeBundle.recordedBrowserRuntime.checksPassed}/{webMcpJudgeBundle.recordedBrowserRuntime.checksTotal} lifecycle checks passed in Chrome for Testing {webMcpJudgeBundle.recordedBrowserRuntime.browser.version}</strong><p>Two public tools remained after cleanup · temporary probe absent · {webMcpJudgeBundle.recordedBrowserRuntime.consoleErrors} console errors · no health information.</p></div>
        <a href="https://github.com/erichuang777777/TrialBridge-TW/blob/main/evals/webmcp-browser-runtime-acceptance.json" target="_blank" rel="noreferrer">Inspect receipt</a>
      </aside>
      <details id="origin-trial-readiness" className={`origin-trial-readiness origin-trial-${originTrial.status}`}>
        <summary><span><i aria-hidden="true" />Origin Trial deployment</span><strong>{originTrialTitle}</strong><small>Inspect boundary</small></summary>
        <div><p>{originTrialDetail}</p><dl><div><dt>Delivery</dt><dd>Server-rendered first-party meta</dd></div><div><dt>Token in JSON</dt><dd>Never</dd></div><div><dt>Browser validation</dt><dd>Required</dd></div></dl><p className="origin-trial-links"><a href="https://developer.chrome.com/blog/ai-webmcp-origin-trial" target="_blank" rel="noreferrer">WebMCP Origin Trial</a><a href="https://developer.chrome.com/docs/web-platform/origin-trial-troubleshooting" target="_blank" rel="noreferrer">Chrome validation guide</a></p></div>
      </details>
    </header>

    <WebMcpBrowserSetup />

    <section className="judge-runbook" aria-labelledby="judge-runbook-title">
      <div className="judge-runbook-heading"><div><p className="eyebrow">Four-step judge path</p><h2 id="judge-runbook-title">Reach each proof without hunting through the site.</h2></div><span>About 5 minutes</span></div>
      <ol>
        <li><span>01</span><h3>Check this browser</h3><p>Run six no-PHI lifecycle checks for discovery, execution, cancellation, toolchange, and cleanup.</p><a href="#live-diagnostic-title">Run live diagnostics</a></li>
        <li><span>02</span><h3>Run a bilingual search</h3><p>Open the same visible declarative form with recruiting, closed, and status-unpublished records available for filtering.</p><Link href="/trials?condition=%E8%83%83%E7%99%8C&includeNotOpen=1">Search 胃癌</Link></li>
        <li><span>03</span><h3>Walk the protected flow</h3><p>Open the fictional case directly; privacy, masking, confirmation, and questions cannot be skipped.</p><Link href="/match?demo=synthetic#private-chat">Open synthetic workflow</Link></li>
        <li><span>04</span><h3>Finish in Inspector</h3><p>Verify natural-language selection, manual calls, permission transitions, and cleanup.</p><a href="https://developer.chrome.com/docs/ai/webmcp" target="_blank" rel="noreferrer">Open Inspector guide</a></li>
      </ol>
      <p className="judge-runbook-boundary"><strong>Evidence boundary:</strong> steps 1–3 are built into TrialBridge TW. Step 4 remains a manual Chrome Model Context Tool Inspector gate and is never inferred from static tests.</p>
    </section>

    <CompetitionPreflight />

    <LiveAgentRehearsal />

    <WebMcpDiagnostics />

    <aside className="recorded-inspector-proof" aria-labelledby="recorded-inspector-title">
      <div className="recorded-inspector-heading">
        <span><i aria-hidden="true" />Recorded stock Inspector runtime</span>
        <strong>{webMcpJudgeBundle.recordedInspectorExtensionRuntime.checksPassed}/{webMcpJudgeBundle.recordedInspectorExtensionRuntime.checksTotal} · Partial</strong>
      </div>
      <div className="recorded-inspector-copy">
        <h2 id="recorded-inspector-title">Real extension plumbing passed discovery and fixed safe execution.</h2>
        <p>Unmodified Model Context Tool Inspector {webMcpJudgeBundle.recordedInspectorExtensionRuntime.inspector.version} ran through its background and content scripts in isolated Chrome for Testing {webMcpJudgeBundle.recordedInspectorExtensionRuntime.browser.version}. This is stronger than a simulated tool list, but it is not a complete Inspector pass.</p>
      </div>
      <ul aria-label="Recorded Inspector outcome summary">
        <li className="recorded-inspector-pass"><strong>Pass</strong><span>Two public tools discovered and both schemas parsed</span></li>
        <li className="recorded-inspector-pass"><strong>Pass</strong><span><code>trialbridge_method</code> completed with fixed empty input</span></li>
        <li className="recorded-inspector-pending"><strong>Not run</strong><span>Natural-language selection, permission transition, and cancellation/cleanup</span></li>
      </ul>
      <div className="recorded-inspector-boundary">
        <p><strong>No Gemini call · no health information.</strong> The stock natural-language path requires a Gemini key, so it was not invoked under the <code>gpt-oss:120b-cloud</code>-only policy. The four remaining checks stay in the manual kit below.</p>
        <div><a href="https://github.com/erichuang777777/TrialBridge-TW/blob/main/evals/webmcp-inspector-extension-runtime.json" target="_blank" rel="noreferrer">Inspect metadata receipt</a><a href={webMcpJudgeBundle.recordedInspectorExtensionRuntime.inspector.repository} target="_blank" rel="noreferrer">Open pinned Inspector source</a></div>
      </div>
    </aside>

    <InspectorAcceptanceKit />

    <section className="proof-section journey-evidence" aria-labelledby="critical-journey-title">
      <div className="proof-section-heading"><p className="eyebrow">Critical user journey</p><h2 id="critical-journey-title">The conversation changes tools and the visible page together.</h2><p>Mapped to Chrome&apos;s current WebMCP user-journey framework: define the user goal, establish the initial state, role-play each tool and UI reaction, then make every invalid state recoverable.</p></div>
      <div className="journey-contract"><article><span>User goal</span><strong>{webMcpCriticalJourney.userGoal}</strong></article><article><span>Initial state</span><strong>{webMcpCriticalJourney.initialState}</strong></article><article><span>Authority boundary</span><strong>{webMcpCriticalJourney.boundary}</strong></article></div>
      <ol className="critical-journey-steps">{webMcpCriticalJourney.steps.map((step) => <li key={step.id}>
        <div className="journey-step-heading"><span>{step.number}</span><div><small>{step.state}</small><h3>{step.title}</h3></div></div>
        <p>{step.goal}</p>
        <dl><div><dt>WebMCP capability</dt><dd>{step.tools.length > 0 ? step.tools.map((tool) => <code key={tool}>{tool}</code>) : <strong>None by design</strong>}</dd></div><div><dt>Visible site reaction</dt><dd>{step.siteReaction}</dd></div><div><dt>Recovery</dt><dd>{step.recovery}</dd></div></dl>
      </li>)}</ol>
      <div className="journey-guidance-link"><p><strong>Why this matters:</strong> the agent receives only the capability that fits the person&apos;s current visible state; the UI never becomes a hidden duplicate.</p><a href="https://developer.chrome.com/docs/ai/webmcp/build-tools" target="_blank" rel="noreferrer">Open Chrome&apos;s user-journey guidance</a></div>
    </section>

    <section className="proof-section standards-evidence" aria-labelledby="standards-evidence-title">
      <div className="proof-section-heading"><p className="eyebrow">Standards alignment</p><h2 id="standards-evidence-title">One product surface, both WebMCP API styles.</h2><p>TrialBridge TW follows the upstream WebMCP draft while retaining the small compatibility boundary required by Chrome&apos;s current Origin Trial implementation. The human workflow remains the source of truth in both cases.</p></div>
      <div className="standards-grid" role="list">{standardsProfile.map((item) => <article key={item.label} role="listitem"><div><span>Implemented</span><small>{item.label}</small></div><h3>{item.title}</h3><code>{item.code}</code><p>{item.detail}</p></article>)}</div>
      <details className="spec-crosswalk">
        <summary><span><strong>Upstream specification crosswalk</strong><small>Exact draft clauses, implementation evidence, and verification boundary</small></span><b>{webMcpSpecCrosswalkBundle.summary.implemented} implemented · {webMcpSpecCrosswalkBundle.summary.explainerAligned} explainer-aligned</b><em>Inspect {webMcpSpecCrosswalkBundle.summary.clauses} clauses</em></summary>
        <div className="spec-crosswalk-body">
          <p className="spec-crosswalk-boundary"><strong>Honest draft boundary:</strong> the upstream declarative section is explicitly marked TODO. TrialBridge follows its current explainer and Chrome profile, so that row is labelled explainer-aligned rather than normative conformance.</p>
          <div className="spec-crosswalk-rows" role="list">{webMcpSpecCrosswalk.map((item) => <article key={item.id} role="listitem">
            <div className={`spec-crosswalk-state spec-${item.status}`}><span aria-hidden="true" /><strong>{item.statusLabel}</strong><code>{item.id}</code></div>
            <div><h3>{item.feature}</h3><small>{item.standardState}</small><p>{item.implementation}</p></div>
            <div className="spec-crosswalk-proof"><span>{item.verification}</span><div>{item.evidence.map((entry) => <code key={entry}>{entry}</code>)}</div><p><a href={item.specUrl} target="_blank" rel="noreferrer">Open upstream clause</a>{"secondarySourceUrl" in item && <a href={item.secondarySourceUrl} target="_blank" rel="noreferrer">Open declarative explainer</a>}</p></div>
          </article>)}</div>
        </div>
      </details>
      <div className="standards-receipt"><p><strong>Compatibility profile audited <time dateTime="2026-09-02">2026-09-02</time></strong><span><code>webmcp-types@0.1.5</code> · upstream draft and Chromium main checked separately</span></p><div><a href="https://webmachinelearning.github.io/webmcp/" target="_blank" rel="noreferrer">WebMCP draft</a><a href="https://developer.chrome.com/docs/ai/webmcp" target="_blank" rel="noreferrer">Chrome guide</a><a href="https://developer.chrome.com/docs/ai/webmcp/secure-tools" target="_blank" rel="noreferrer">Security guide</a></div></div>
    </section>

    <ToolContractExplorer />

    <CapabilityStateSimulator />

    <section className="proof-section conformance-evidence" aria-labelledby="conformance-title">
      <div className="proof-section-heading"><p className="eyebrow">Judge conformance bundle</p><h2 id="conformance-title">Every WebMCP claim carries an evidence class.</h2><p>Repository checks, recorded browser lifecycle evidence, partial stock Inspector evidence, the cloud-model eval, and the remaining manual gate stay visibly separate. This matrix is competition evidence—not a new WebMCP protocol endpoint.</p></div>
      <div className="conformance-summary" aria-label="Conformance evidence summary">
        <article><strong>{webMcpJudgeBundle.summary.repositoryVerified}</strong><span>Repository verified</span></article>
        <article><strong>{webMcpJudgeBundle.recordedBrowserRuntime.checksPassed}/{webMcpJudgeBundle.recordedBrowserRuntime.checksTotal}</strong><span>Recorded browser runtime</span></article>
        <article><strong>{webMcpJudgeBundle.recordedInspectorExtensionRuntime.checksPassed}/{webMcpJudgeBundle.recordedInspectorExtensionRuntime.checksTotal}</strong><span>Stock Inspector partial</span></article>
        <article><strong>{webMcpJudgeBundle.summary.recordedModelEval}</strong><span>Recorded model eval</span></article>
        <article><strong>{webMcpJudgeBundle.summary.manualGate}</strong><span>Manual Inspector gate</span></article>
      </div>
      <div className="conformance-matrix" role="list">{webMcpConformanceMatrix.map((item) => <article key={item.id} role="listitem">
        <div className={`conformance-state matrix-${item.evidenceClass}`}><span aria-hidden="true" /><strong>{item.evidenceLabel}</strong><small>{item.id}</small></div>
        <div><h3>{item.requirement}</h3><p>{item.implementation}</p></div>
        <div className="conformance-source"><span>Evidence</span>{item.evidence.map((entry) => entry.startsWith("https://") ? <a key={entry} href={entry} target="_blank" rel="noreferrer">Chrome documentation</a> : <code key={entry}>{entry}</code>)}</div>
      </article>)}</div>
      <div className="judge-bundle-download"><div><strong>Download the static judge bundle</strong><p>Contains this matrix, capability inventory, source links, audit metadata, and recorded artifact digests. It reads no browser session, note, profile, results, or chat.</p></div><a className="secondary-action action-link" href="/webmcp/evidence.json" download={`trialbridge-webmcp-judge-bundle-${webMcpJudgeBundle.auditedAt}.json`}>Download evidence JSON</a></div>
    </section>

    <section className="proof-section implementation-evidence" aria-labelledby="implementation-evidence-title">
      <div className="proof-section-heading"><p className="eyebrow">Implementation landscape</p><h2 id="implementation-evidence-title">The proposed standard is already crossing agent hosts.</h2><p>This is dated ecosystem evidence, not a compatibility claim about the browser currently viewing this page. Each status links to its primary project source.</p></div>
      <div className="implementation-grid" role="list">{webMcpImplementationLandscape.entries.map((entry) => <article key={entry.platform} role="listitem">
        <div><span className={`implementation-status implementation-${entry.status}`}>{entry.statusLabel}</span><small>Source-reported</small></div>
        <h3>{entry.platform}</h3><p>{entry.detail}</p><a href={entry.sourceUrl} target="_blank" rel="noreferrer">{entry.sourceLabel}</a>
      </article>)}</div>
      <p className="implementation-boundary"><strong>Audited <time dateTime={webMcpImplementationLandscape.auditedAt}>{webMcpImplementationLandscape.auditedAt}</time></strong><span>Upstream commit <code>{webMcpImplementationLandscape.upstreamCommit}</code> · {webMcpImplementationLandscape.evidenceBoundary}</span></p>
    </section>

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

    <section className="proof-section proof-guardrails" aria-labelledby="guardrails-title">
      <div className="proof-section-heading"><p className="eyebrow">Authority boundary</p><h2 id="guardrails-title">Useful enough to navigate. Constrained enough to trust.</h2></div>
      <div className="method-proof-grid"><article><strong>Data minimized</strong><p>Raw and masked notes never enter a WebMCP schema or result.</p></article><article><strong>Visible state controls capability</strong><p>Question recovery follows pending state; shortlist comparison appears only after two user selections.</p></article><article><strong>No consequential writes</strong><p>No tool can enroll, send, book, consent, or change treatment.</p></article></div>
    </section>

    <section className="proof-section receipt-proof" aria-labelledby="receipt-proof-title">
      <div className="proof-section-heading"><p className="eyebrow">Judge-visible lifecycle</p><h2 id="receipt-proof-title">Capability changes leave a payload-free session receipt.</h2><p>Open <strong>WebMCP Live</strong> in the guided workflow to watch public, permission-gated, and shortlist-dependent tools appear or disappear. The tab keeps only the latest 20 lifecycle events and can download them as a local JSON receipt.</p></div>
      <div className="method-proof-grid"><article><strong>What it records</strong><p>UTC time, verified tool names, additions, removals, and running/completed/failed/cancelled states.</p></article><article><strong>What it excludes</strong><p>No medical note, profile fact, trial result, prompt, tool argument, tool output, or registration error detail.</p></article><article><strong>Where it lives</strong><p>Volatile React state in the current tab. Download happens only after a visible user action; TrialBridge never uploads it.</p></article></div>
      <Link className="secondary-action action-link" href="/match#private-chat">Open the guided workflow receipt</Link>
    </section>

    <aside className="proof-next-step" aria-label="Judge verification boundary"><strong>Final judge gate</strong><p>This page proves the implementation and current-browser lifecycle. Natural-language tool selection and permission transitions must still be demonstrated in Chrome Model Context Tool Inspector.</p><div><Link href="/trials">Try the declarative trial form</Link><a href="https://developer.chrome.com/docs/ai/webmcp" target="_blank" rel="noreferrer">Open Chrome WebMCP documentation</a><a href="https://github.com/erichuang777777/TrialBridge-TW/actions" target="_blank" rel="noreferrer">View GitHub CI evidence</a></div></aside>
  </main>;
}
