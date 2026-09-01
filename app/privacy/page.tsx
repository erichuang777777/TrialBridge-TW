import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="document-page" id="main-content" tabIndex={-1}>
      <Link className="back-link" href="/">← Back home</Link>
      <p className="eyebrow">Privacy principles</p>
      <h1>Medical information is not ordinary chat content.</h1>
      <ul className="document-list">
        <li>Anonymous use is supported; an account is not required.</li>
        <li>Direct identifiers are masked in the browser first.</li>
        <li>Original free text exists only in volatile page memory by default—not localStorage or server logs.</li>
        <li>After the person selects the visible cloud-organization action, the reviewed masked note is sent to gpt-oss:120b-cloud through the localhost Ollama proxy for extraction; there is no redundant consent checkbox.</li>
        <li>Masking reduces direct identifiers but cannot guarantee complete de-identification; localhost is only a proxy and cloud inference is remote.</li>
        <li>WebMCP cannot read the original note; it can use only confirmed, minimized fields.</li>
        <li>The optional WebMCP session receipt contains capability names and lifecycle states only, remains in the current tab, and is downloaded only after a visible action.</li>
        <li>External contact content is created only as an unsent draft.</li>
      </ul>
      <p className="notice">Legal, security, clinical-governance and incident-response review remains required before public launch.</p>
    </main>
  );
}
