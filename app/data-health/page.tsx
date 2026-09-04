import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "../components/BrandMark";
import { getTrialIndexStore } from "@/lib/trials/index/store";
import { registryIntegrationCatalog } from "@/lib/trials/sourceCatalog";
import { inspectNciTerminology } from "@/lib/trials/terminology/nci";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Public data health", description: "Inspect TrialBridge TW registry index coverage, freshness, and ingestion history.", robots: { index: false, follow: false } };

function date(value?: string) {
  return value ? new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(value)) : "Not yet";
}

export default async function DataHealthPage() {
  const [health, nciTerminology] = await Promise.all([getTrialIndexStore().health(), inspectNciTerminology()]);
  const integrations = registryIntegrationCatalog().map((source) => source.id === "ncit" && nciTerminology.status === "ready" ? { ...source, state: "active" as const } : source);
  return <main id="main-content" className="data-health-page" tabIndex={-1}>
    <header className="site-header">
      <Link className="brand" href="/" aria-label="TrialBridge TW home"><BrandMark /><span><strong>TrialBridge TW</strong><small>Public data operations</small></span></Link>
      <nav aria-label="Main navigation"><Link href="/">Demo</Link><Link href="/trials">Trial database</Link></nav>
    </header>
    <section className="data-health-hero" aria-labelledby="data-health-title">
      <div><p className="eyebrow">Public registry index · no patient data</p><h1 id="data-health-title">Know what is local, current, and incomplete.</h1><p>UI, chat, and WebMCP search the same public index. Live registry access is reserved for synchronization and exact-record rechecks.</p></div>
      <div className={`health-overall health-${health.status}`}><span>Index status</span><strong>{health.status}</strong><small>{health.backend} · {health.totalRecords.toLocaleString("en")} records</small></div>
    </section>
    <section className="health-metrics" aria-label="Trial index summary">
      <article><span>Total indexed records</span><strong>{health.totalRecords.toLocaleString("en")}</strong><small>Public records only</small></article>
      <article><span>Active sources</span><strong>{health.sources.filter((source) => source.recordCount > 0).length}/{health.sources.length}</strong><small>TFDA + ClinicalTrials.gov</small></article>
      <article><span>Last successful sync</span><strong>{date(health.lastSuccessfulSyncAt)}</strong><small>Asia/Taipei</small></article>
      <article><span>Patient records stored</span><strong>0</strong><small>Separate volatile workflow</small></article>
    </section>
    <section className="source-health-section" aria-labelledby="source-health-title">
      <div className="section-heading"><div><p className="eyebrow">Indexed sources</p><h2 id="source-health-title">Freshness and coverage</h2></div><p>Changed and removed counts refer to the latest completed synchronization.</p></div>
      <div className="source-health-grid">{health.sources.map((source) => <article key={source.registry} className={`source-health-card source-${source.status}`}>
        <header><div><span className="status-dot" aria-hidden="true" /><strong>{source.registry}</strong></div><b>{source.status.replaceAll("_", " ")}</b></header>
        <dl><div><dt>Records</dt><dd>{source.recordCount.toLocaleString("en")}</dd></div><div><dt>Changed</dt><dd>{source.changedCount.toLocaleString("en")}</dd></div><div><dt>Removed</dt><dd>{source.removedCount.toLocaleString("en")}</dd></div><div><dt>Last success</dt><dd>{date(source.lastSuccessAt)}</dd></div></dl>
        {source.sourceVersion && <p><span>Source version</span><code>{source.sourceVersion}</code></p>}
        {source.message && <small>{source.message}</small>}
      </article>)}</div>
    </section>
    <section className="ingestion-history" aria-labelledby="ingestion-history-title">
      <div className="section-heading"><div><p className="eyebrow">Operations</p><h2 id="ingestion-history-title">Recent ingestion runs</h2></div><code>npm run sync:trial-index</code></div>
      {health.recentRuns.length === 0 ? <p className="health-empty">No synchronization has completed yet. The website will retain its bounded live-source fallback until the first index is ready.</p> : <ol>{health.recentRuns.map((run) => <li key={run.id}><span className={`run-state run-${run.status}`}>{run.status}</span><div><strong>{run.registry}</strong><small>{date(run.startedAt)}</small></div><dl><div><dt>Received</dt><dd>{run.receivedCount.toLocaleString("en")}</dd></div><div><dt>Changed</dt><dd>{run.changedCount.toLocaleString("en")}</dd></div><div><dt>Removed</dt><dd>{run.removedCount.toLocaleString("en")}</dd></div></dl></li>)}</ol>}
    </section>
    <section className="integration-roadmap" aria-labelledby="integration-title">
      <div className="section-heading"><div><p className="eyebrow">Source contracts</p><h2 id="integration-title">Integrated and gated extensions</h2></div><p>Availability is not the same as permission to ingest.</p></div>
      <div className="integration-grid">{integrations.map((source) => <article key={source.id}><header><strong>{source.name}</strong><span className={`integration-state integration-${source.state}`}>{source.state.replaceAll("_", " ")}</span></header><p>{source.role}</p><dl><div><dt>Scope</dt><dd>{source.scope}</dd></div><div><dt>Mode</dt><dd>{source.integration.replaceAll("_", " ")}</dd></div></dl><small>{source.updatePolicy}</small>{source.id === "ncit" && nciTerminology.status === "ready" && <p className="terminology-receipt">{nciTerminology.conceptCount} local concepts · version {nciTerminology.version ?? "not published"} · {date(nciTerminology.generatedAt)}</p>}{source.commercialNote && <p className="rights-note">{source.commercialNote}</p>}<a href={source.sourceUrl} target="_blank" rel="noreferrer">Inspect source</a></article>)}</div>
    </section>
    <footer><p>Registry records describe research plans. Fresh public data does not prove benefit or determine final eligibility.</p></footer>
  </main>;
}
