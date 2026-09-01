import type { Metadata } from "next";
import Link from "next/link";
import { createPageMetadata } from "@/lib/site/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "How TrialBridge TW Works",
  description: "Understand the human-confirmed, privacy-aware, Taiwan-first clinical-trial navigation method and its constrained WebMCP tools.",
  path: "/method",
});

export default function MethodPage() {
  return (
    <main className="document-page" id="main-content" tabIndex={-1}>
      <Link className="back-link" href="/">← Back home</Link>
      <p className="eyebrow">How it works</p>
      <h1>A three-stage, human-confirmed process</h1>
      <ol className="document-list">
        <li><strong>Chat-guided cloud organization:</strong> A persistent assistant helps collect the information. The browser masks direct identifiers before guided cloud chat or note organization, and gpt-oss:120b-cloud creates a structured draft through the localhost Ollama proxy.</li>
        <li><strong>Human confirmation:</strong> The patient or caregiver corrects and confirms every item. Unconfirmed data cannot enter matching or WebMCP.</li>
        <li><strong>Regional search:</strong> A visible bilingual query bridge sends exact curated cancer terms to TFDA in Traditional Chinese and ClinicalTrials.gov in English. Search then follows Taiwan, Asia, and worldwide, with registry sources, update dates, unknown criteria and next questions.</li>
      </ol>
      <section className="method-section" aria-labelledby="webmcp-value"><p className="eyebrow">Why WebMCP matters</p><h2 id="webmcp-value">The website defines safe tools instead of making an agent guess the interface.</h2><p>TrialBridge TW exposes structured, browser-discoverable capabilities for method explanation, public registry search, pending-requirement review, confirmed-result explanation, an unsent outreach draft, and a source-traceable care-team discussion brief. Public tools are always available. Confirmed-context tools appear only after confirmation and visible WebMCP permission.</p><div className="method-proof-grid"><article><strong>Discoverable</strong><p>Named tools and JSON schemas make intent and input boundaries explicit.</p></article><article><strong>State-aware</strong><p>The available tools change with the confirmed profile, pending questions, results, and permission state.</p></article><article><strong>Constrained</strong><p>Raw notes are unavailable; no tool can enroll, submit, send, schedule, or change treatment.</p></article></div></section>
      <p className="notice">A clinical-trial registry describes a research plan, not proof of benefit. Final eligibility must be determined by the study team.</p>
    </main>
  );
}
