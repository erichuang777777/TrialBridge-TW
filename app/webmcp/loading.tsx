import { RouteLoading } from "../components/RouteLoading";

export default function WebMcpLoading() {
  return <RouteLoading
    eyebrow="WebMCP competition evidence"
    title="Opening the browser-native capability proof."
    description="Contracts, recorded evidence, and manual acceptance gates remain visibly separate so judges can verify each claim."
    status="Preparing the WebMCP evidence path…"
    steps={[
      { label: "Read-only capabilities", detail: "No enrollment, sending, or shortlist-write authority." },
      { label: "Metadata-only evidence", detail: "Competition receipts contain no health information." },
      { label: "Honest verification gates", detail: "Repository, browser, model, and Inspector proof stay distinct." },
    ]}
  />;
}
