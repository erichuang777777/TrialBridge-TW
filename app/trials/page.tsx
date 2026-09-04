import type { Metadata } from "next";
import Link from "next/link";
import { createPageMetadata } from "@/lib/site/metadata";
import { BrandMark } from "../components/BrandMark";
import { TrialDatabase } from "../components/TrialDatabase";

export const metadata: Metadata = createPageMetadata({
  title: "Bilingual Trial Database",
  description: "Search public TFDA and ClinicalTrials.gov cancer trial records with a visible bilingual query plan and Taiwan-first ordering.",
  path: "/trials",
});

export default function TrialsPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="TrialBridge TW home">
          <BrandMark />
          <span><strong>TrialBridge TW</strong><small>試驗橋</small></span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/">Demo</Link>
          <Link href="/trials" aria-current="page">Trial database</Link>
        </nav>
      </header>

      <section className="database-hero" aria-labelledby="database-title">
        <p className="eyebrow">Public trial database · 公開試驗資料庫</p>
        <h1 id="database-title">Search trial registries directly.</h1>
        <p className="lead">Browse a locally indexed TFDA and ClinicalTrials.gov cancer corpus without entering medical records. The visible bilingual query bridge and shared data layer serve UI, chat, and WebMCP; exact records can be rechecked live before action.</p>
      </section>

      <TrialDatabase />
    </main>
  );
}
