import Link from "next/link";
import { BrandMark } from "./components/BrandMark";
import { TrialBridgeChat } from "./components/TrialBridgeChat";

const regions = [
  { step: "01", title: "Taiwan first", detail: "Start with trials and contact sites in Taiwan." },
  { step: "02", title: "Then Asia", detail: "Expand to other Asian locations when needed." },
  { step: "03", title: "Then worldwide", detail: "Finally review public registries worldwide." },
];

export default function Home() {
  return (
    <main id="main-content" tabIndex={-1}>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="TrialBridge TW home">
          <BrandMark />
          <span>
            <strong>TrialBridge TW</strong>
            <small>試驗橋</small>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/trials">Trial database</Link>
          <Link className="nav-optional" href="/method">How it works</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Cancer clinical-trial navigation</p>
          <h1 id="hero-title">Turn complex trial information into questions you can discuss with your care team.</h1>
          <p className="lead">
            Describe the situation in English or Chinese. Identifiers are masked before the reviewed content is sent to gpt-oss:120b-cloud with your consent. Searching starts only after you confirm every item.
          </p>
          <div className="trust-row" aria-label="Privacy and safety commitments">
            <span>No account required</span>
            <span>Original text is not saved by default</span>
            <span>Matching only after confirmation</span>
          </div>
          <div className="hero-actions"><a className="primary-action action-link" href="#private-chat">Start guided matching</a><Link className="secondary-action action-link" href="/trials">Browse trial database</Link></div>
        </div>

        <aside className="route-card" aria-label="Trial search order">
          <p className="eyebrow">Search order</p>
          <ol>
            {regions.map((region) => (
              <li key={region.step}>
                <span>{region.step}</span>
                <div>
                  <strong>{region.title}</strong>
                  <p>{region.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <TrialBridgeChat />

      <section className="principles" aria-labelledby="principles-title">
        <div>
          <p className="eyebrow">You stay in control</p>
          <h2 id="principles-title">Understand first. Confirm next. Search last.</h2>
        </div>
        <div className="principle-grid">
          <article>
            <span>1</span>
            <h3>Describe the situation</h3>
            <p>Patients and caregivers can begin in everyday language without knowing clinical terminology.</p>
          </article>
          <article>
            <span>2</span>
            <h3>Confirm the summary</h3>
            <p>The system creates an editable draft. Model interpretations do not become your medical facts.</p>
          </article>
          <article>
            <span>3</span>
            <h3>Discuss with your care team</h3>
            <p>Results show sources, open questions and an unsent contact draft—never an eligibility or benefit claim.</p>
          </article>
        </div>
      </section>

      <footer>
        <p>TrialBridge TW organizes information for care discussions. It does not provide medical advice or replace eligibility review by a study team.</p>
      </footer>
    </main>
  );
}
