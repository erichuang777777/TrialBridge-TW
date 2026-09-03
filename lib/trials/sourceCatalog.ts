export interface RegistryIntegrationDescriptor {
  id: string;
  name: string;
  scope: string;
  integration: "indexed" | "terminology" | "optional_adapter";
  state: "active" | "configured" | "available" | "rights_review";
  updatePolicy: string;
  role: string;
  sourceUrl: string;
  commercialNote?: string;
}

export function registryIntegrationCatalog(environment: NodeJS.ProcessEnv = process.env): RegistryIntegrationDescriptor[] {
  return [
    {
      id: "tfda", name: "TFDA", scope: "Taiwan", integration: "indexed", state: "active",
      updatePolicy: "Daily full snapshot; content hashes isolate changed records.",
      role: "Taiwan-approved drug trial records and Chinese eligibility wording.", sourceUrl: "https://data.gov.tw/dataset/177198",
    },
    {
      id: "ctgov", name: "ClinicalTrials.gov", scope: "Worldwide", integration: "indexed", state: "active",
      updatePolicy: "Weekday dataTimestamp check with a two-day overlap; changed records merge atomically. A weekly full load reconciles removals.",
      role: "Recruitment, published sites, contacts, interventions, and eligibility.", sourceUrl: "https://clinicaltrials.gov/data-api/api",
    },
    {
      id: "ncit", name: "NCI Thesaurus", scope: "Cancer terminology", integration: "terminology", state: environment.NCI_TERMINOLOGY_PATH ? "configured" : "available",
      updatePolicy: "Versioned local snapshot rebuilt from exact NCI concept matches.",
      role: "Curated cancer-group synonym expansion for bilingual registry search. Subtype and biomarker expansion remain future work.", sourceUrl: "https://evs.nci.nih.gov/",
    },
    {
      id: "nci-cts", name: "NCI Clinical Trials Search", scope: "United States cancer trials", integration: "optional_adapter", state: environment.NCI_CTS_API_KEY ? "configured" : "available",
      updatePolicy: "Optional API-key-backed background adapter; never queried from the patient request path.",
      role: "Cancer-specific disease and intervention structure that can complement ClinicalTrials.gov.", sourceUrl: "https://clinicaltrialsapi.cancer.gov/",
    },
    {
      id: "who-ictrp", name: "WHO ICTRP", scope: "Global registry bridge", integration: "optional_adapter", state: "rights_review",
      updatePolicy: "Import is disabled until intended deployment use is confirmed against current terms.",
      role: "Discovery and cross-registry identifiers for records outside current sources.", sourceUrl: "https://trialsearch.who.int/",
      commercialNote: "WHO ICTRP terms require attribution/currentness and restrict marketing, promotional, and commercial use.",
    },
    {
      id: "regional", name: "Regional adapters", scope: "Japan · Korea · EU · Australia/NZ · China", integration: "optional_adapter", state: "rights_review",
      updatePolicy: "Shared WHO TRDS contract is implemented as a normalization boundary; each live source still requires terms and API validation.",
      role: "jRCT/JPRN, CRiS, CTIS, ANZCTR, and ChiCTR expansion after source review.", sourceUrl: "https://www.who.int/tools/clinical-trials-registry-platform/network/data-providers",
    },
  ];
}
