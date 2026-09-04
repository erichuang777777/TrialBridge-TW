import Link from "next/link";
import { BrandMark } from "./components/BrandMark";
import { HeroConstellation } from "./components/HeroConstellation";
import { WebMcpBridge } from "./components/WebMcpBridge";
import { LandingTrialSearch } from "./components/LandingTrialSearch";

export default function Home() {
  return (
    <main id="main-content" className="landing-page" tabIndex={-1}>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="TrialBridge TW home">
          <BrandMark />
          <span>
            <strong>TrialBridge TW</strong>
            <small>試驗橋</small>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/">Demo</Link>
          <Link href="/trials">Trial database</Link>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">A chance called hope</p>
          <h1 id="hero-title">Hope starts with knowing what trial options remain.</h1>
          <p className="lead">
            Find source-linked cancer clinical trials that may be worth discussing—Taiwan first, then Asia and worldwide. TrialBridge TW compares only the medical facts you confirm and never decides eligibility.
          </p>
          <div className="trust-row" aria-label="Privacy and safety commitments">
            <span>No account required</span>
            <span>Original text is not saved by default</span>
            <span>Matching only after confirmation</span>
          </div>
          <div className="hero-actions"><Link className="primary-action action-link" href="/trials">Search public trials</Link><Link className="secondary-action action-link" href="/match">Explore matching</Link></div>
          <p className="hero-path"><strong>Describe</strong><span aria-hidden="true">→</span><strong>Review your facts</strong><span aria-hidden="true">→</span><strong>Compare trials</strong></p>
          <WebMcpBridge compact matches={[]} shortlistedTrialIds={[]} pendingQuestions={[]} matching={false} sensitiveConsent={false} language="en" />
        </div>
        <HeroConstellation />
      </section>

      <LandingTrialSearch />

      <footer>
        <p>TrialBridge TW organizes information for care discussions. It does not provide medical advice or replace eligibility review by a study team.</p>
      </footer>
    </main>
  );
}
