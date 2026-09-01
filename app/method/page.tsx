import Link from "next/link";

export default function MethodPage() {
  return (
    <main className="document-page" id="main-content" tabIndex={-1}>
      <Link className="back-link" href="/">← Back home</Link>
      <p className="eyebrow">How it works</p>
      <h1>A three-stage, human-confirmed process</h1>
      <ol className="document-list">
        <li><strong>Consented cloud organization:</strong> The browser masks direct identifiers. After the person reviews and explicitly approves the transfer, gpt-oss:120b-cloud creates a structured draft through the localhost Ollama proxy.</li>
        <li><strong>Human confirmation:</strong> The patient or caregiver corrects and confirms every item. Unconfirmed data cannot enter matching or WebMCP.</li>
        <li><strong>Regional search:</strong> Search follows Taiwan, Asia, then worldwide, with registry sources, update dates, unknown criteria and next questions.</li>
      </ol>
      <p className="notice">A clinical-trial registry describes a research plan, not proof of benefit. Final eligibility must be determined by the study team.</p>
    </main>
  );
}
