import { RouteLoading } from "../components/RouteLoading";

export default function TrialsLoading() {
  return <RouteLoading
    eyebrow="Public trial database"
    title="Opening the bilingual registry search."
    description="Browse public trial records without entering a medical record. Search order stays Taiwan first, then Asia and worldwide."
    status="Preparing the public search…"
    steps={[
      { label: "No medical record", detail: "The public form accepts one general cancer topic." },
      { label: "Bilingual query bridge", detail: "English and Traditional Chinese registry terms stay visible." },
      { label: "Traceable sources", detail: "TFDA and ClinicalTrials.gov receipts remain separate." },
    ]}
  />;
}
