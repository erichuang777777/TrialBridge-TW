/* ============================================================================
   Eval fixtures — synthetic studies and patients.

   Everything here is invented. No real patient data, and the studies are
   fabricated shapes rather than copies of registry records, so the suite can
   live in a public repo and run in CI without touching the network.
   ========================================================================== */

import type { Trial, TrialLocation, Criterion } from "../lib/types";

export function site(city: string, state: string, status = "RECRUITING"): TrialLocation {
  return { facility: `${city} Medical Center`, city, state, country: "United States", status, contacts: [] };
}

/** A registry-shaped study with sensible defaults; override only what a case
 *  is actually about, so each test reads as the one thing it asserts. */
export function trial(over: Partial<Trial> = {}): Trial {
  return {
    nctId: "NCT00000000",
    title: "A Study of Something",
    officialTitle: "",
    phase: "Phase 2",
    studyType: "Interventional",
    overallStatus: "RECRUITING",
    sponsor: "Example Sponsor",
    conditions: ["Breast Cancer"],
    eligibilityCriteria: "Inclusion: adults.",
    sex: "ALL",
    minimumAge: "18 Years",
    maximumAge: "",
    stdAges: ["ADULT", "OLDER_ADULT"],
    locations: [site("Boston", "Massachusetts")],
    url: "https://clinicaltrials.gov/study/NCT00000000",
    startDate: "2025-01",
    primaryCompletionDate: "2027-06",
    completionDate: "2028-06",
    lastUpdatePostDate: "2026-06-01",
    registry: "ClinicalTrials.gov",
    contacts: [],
    randomized: false,
    masked: false,
    primaryPurpose: "Treatment",
    interventional: true,
    enrollment: 100,
    interventions: [{ type: "Drug", name: "Example" }],
    ...over,
  };
}

export function criterion(over: Partial<Criterion> = {}): Criterion {
  return {
    kind: "incl",
    verdict: "meets",
    requirement: "A requirement",
    evidence: "Some evidence",
    provenance: "note",
    remediable: false,
    gloss: "",
    ...over,
  };
}
