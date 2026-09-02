import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "../components/BrandMark";
import { TrialBridgeChat } from "../components/TrialBridgeChat";
import { isSyntheticDemoValue } from "@/lib/chat/state";

export const metadata: Metadata = {
  title: "Private cancer trial matching workspace",
  description: "Describe, review, and compare source-linked cancer clinical trials with TrialBridge TW.",
  robots: { index: false, follow: false },
};

export default async function MatchWorkspace({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const initialSyntheticDemo = isSyntheticDemoValue(query.demo);
  return (
    <main id="main-content" className="match-page" tabIndex={-1}>
      <header className="site-header match-header">
        <Link className="brand" href="/" aria-label="TrialBridge TW home">
          <BrandMark />
          <span><strong>TrialBridge TW</strong><small>Matching workspace</small></span>
        </Link>
        <nav aria-label="Workspace navigation">
          <Link href="/">Home</Link>
          <Link href="/trials">Trial database</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </header>
      <section className="workspace-intro" aria-labelledby="workspace-title">
        <p className="eyebrow">Private matching workspace</p>
        <h1 id="workspace-title">Build a confirmed profile, then compare public trial requirements.</h1>
        <p>Chat or paste a note. You remain in control of every medical fact; TrialBridge TW does not determine eligibility.</p>
      </section>
      <TrialBridgeChat initialSyntheticDemo={initialSyntheticDemo} />
      <footer><p>TrialBridge TW organizes information for care discussions. It does not provide medical advice or replace eligibility review by a study team.</p></footer>
    </main>
  );
}
