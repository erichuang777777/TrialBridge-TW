import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/app/components/BrandMark";
import { createPageMetadata } from "@/lib/site/metadata";
import { QuickJudgeConsole } from "./_components/QuickJudgeConsole";
import recordedAgenticLighthouse from "@/evals/webmcp-lighthouse-agentic-acceptance.json";

export const metadata: Metadata = createPageMetadata({
  title: "Three-minute WebMCP Demo",
  description: "A concise judge path for TrialBridge TW browser-native WebMCP discovery, safe execution, visible public search, and human-control boundaries.",
  path: "/webmcp/quickstart",
});

export default function WebMcpQuickstartPage() {
  return <main className="quickstart-page" id="main-content" tabIndex={-1}>
    <header className="quickstart-header">
      <nav aria-label="Quickstart navigation"><Link className="brand" href="/"><BrandMark /><span><strong>TrialBridge TW</strong><small>試驗橋</small></span></Link><div><Link href="/webmcp">Full evidence lab</Link><a href="https://github.com/erichuang777777/OpenAI-webMCP-hackthon/actions" target="_blank" rel="noreferrer">GitHub CI</a></div></nav>
      <p className="eyebrow">Three-minute judge demo</p>
      <h1>See why WebMCP matters—without reading the whole appendix.</h1>
      <p className="lead">TrialBridge turns the same visible clinical-trial interface into typed, state-scoped browser capabilities. The agent does less guessing; the person keeps control.</p>
      <div className="quickstart-summary" aria-label="Quick WebMCP summary"><span><strong>2</strong> public tools now</span><span><strong>1</strong> visible declarative form</span><span><strong>0</strong> write or enrollment tools</span><span><strong>3 min</strong> target path</span></div>
      <p className="quickstart-boundary"><strong>No patient data required.</strong> The live check below uses only public capability metadata and one fixed, no-input method call.</p>
    </header>

    <QuickJudgeConsole />

    <aside className="quick-agentic-proof" aria-label="Recorded Lighthouse Agentic Browsing evidence">
      <span><i aria-hidden="true" />Recorded local audit</span>
      <div><strong>{recordedAgenticLighthouse.pages.length}/{recordedAgenticLighthouse.pages.length} Agentic Browsing pages passed</strong><p>Lighthouse {recordedAgenticLighthouse.lighthouse.version} · accessibility trees valid · WebMCP schemas valid · <code>llms.txt</code> passed · CLS 0</p></div>
      <div><a href="/webmcp/evidence.json">Inspect metadata</a><a href={recordedAgenticLighthouse.lighthouse.officialAuditDocumentation} target="_blank" rel="noreferrer">Chrome audit method</a></div>
    </aside>

    <section className="quickstart-path" aria-labelledby="quickstart-path-title">
      <div><p className="eyebrow">Continue the visible journey</p><h2 id="quickstart-path-title">Three proofs. One human-controlled product.</h2></div>
      <ol>
        <li><span>01</span><small>Discover</small><h3>Two public tools follow the page origin.</h3><p>The console above registers and verifies only the method and public-search capabilities.</p><a href="#quick-console-title">Check this browser</a></li>
        <li><span>02</span><small>Use the visible UI</small><h3>Search Taiwan and worldwide registries.</h3><p>Open the same declarative form a person sees and inspect the `胃癌 → gastric cancer` query bridge.</p><Link href="/trials?condition=%E8%83%83%E7%99%8C&includeNotOpen=1">Open public 胃癌 search</Link></li>
        <li><span>03</span><small>Protect context</small><h3>Private tools appear only after human confirmation.</h3><p>The fictional workflow still requires masking, cloud organization, fact confirmation, and visible permission.</p><Link href="/match?demo=synthetic#private-chat">Open synthetic workflow</Link></li>
      </ol>
    </section>

    <section className="quickstart-next" aria-labelledby="quickstart-next-title">
      <div><p className="eyebrow">Technical appendix</p><h2 id="quickstart-next-title">Need every contract and evidence boundary?</h2><p>The full lab keeps lifecycle diagnostics, live cloud-model selection, fixed public execution, Inspector acceptance, schemas, source links, and recorded receipts separate.</p></div>
      <div><Link className="primary-action action-link" href="/webmcp">Open full evidence lab</Link><a className="secondary-action action-link" href="/webmcp/evidence.json">Download evidence JSON</a></div>
    </section>
    <footer><p>TrialBridge TW organizes public trial information for care discussions. It does not decide eligibility or provide medical advice.</p></footer>
  </main>;
}
