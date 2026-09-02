import { RouteLoading } from "../components/RouteLoading";

export default function MatchLoading() {
  return <RouteLoading
    eyebrow="Private matching workspace"
    title="Opening your guided trial workspace."
    description="The workspace starts anonymously and keeps Describe, Review, and Compare in one human-controlled path."
    status="Preparing the private workspace…"
    steps={[
      { label: "Anonymous session", detail: "No account or browser storage is required." },
      { label: "Confirmed facts", detail: "Matching starts only after you review the organized summary." },
      { label: "Source-linked results", detail: "Public registry wording remains inspectable." },
    ]}
  />;
}
