/* ============================================================================
   Demo fixture — deterministic cohort screen for the "sample cohort" (§C1)

   The mirror of lib/demoMatch.ts on the cohort side: a coordinator must be able
   to see the cohort-screening matrix render — every column, every status
   bucket that can plausibly occur, the criterion ledger, the CSV export —
   without an API key and without a live ClinicalTrials.gov lookup. So this is
   not a call to /api/screen at all; the screen page short-circuits straight to
   this fixture, the same way "Use the sample patient (Margaret)" short-circuits
   the results screen. See app/screen/page.tsx's loadSample().

   Reuses the exact NCT id and clinical world lib/demoMatch.ts uses (a real
   ClinicalTrials.gov study in HR+/HER2- metastatic breast cancer) so the deep
   link resolves and the sample reads as one consistent demo persona set across
   both sides of the product, not a second invented world.

   One thing this fixture deliberately does NOT attempt: mixing "screened" rows
   in with eligible/uncertain/near ones. In the real route, "screened" fires
   only when the TRIAL publishes no eligibility text at all (see reasonTrial in
   lib/reason.ts) — a property of the one trial every row shares, not of any one
   patient. So within a single request every reasoned patient is screened
   together or none are; a mix would be a combination the real pipeline can
   never produce, and faking it here would misstate how the product works.
   "Excluded" has no such constraint (the structural gate runs per patient), so
   the fixture does include it.

   Statuses and tallies are DERIVED from the authored criteria via the same
   lib/verdict.ts functions the route uses — never hand-typed — so this fixture
   cannot silently drift from the rule "status is derived in code".
   ========================================================================== */

import type { Criterion } from "@/lib/types";
import { deriveStatus, metCountOf, openCountOf, hardFailCountOf, compareCohortPatients, cohortCounts } from "@/lib/verdict";
import type { PatientInput, PatientResult, ScreenResponse } from "@/lib/screenTypes";

const c = (
  kind: "incl" | "excl",
  verdict: Criterion["verdict"],
  requirement: string,
  evidence: string,
  remediable = false,
): Criterion => ({ kind, verdict, requirement, evidence, provenance: "note", remediable, gloss: "" });

export const SAMPLE_NCT_ID = "NCT04305496";

export const SAMPLE_TRIAL = {
  nctId: SAMPLE_NCT_ID,
  title: "Capivasertib + Fulvestrant in HR+/HER2- Advanced Breast Cancer (CAPItello-291)",
  phase: "Phase 3",
  sponsor: "AstraZeneca",
  url: `https://clinicaltrials.gov/study/${SAMPLE_NCT_ID}`,
  overallStatus: "RECRUITING",
  registryAgeDays: 12,
  registryStale: false,
};

/* ---- the raw cohort a coordinator might have typed in --------------------
   Populated into the input editor when "Try the sample cohort" is used, so
   the sample is inspectable and editable, not just a black-box result. These
   prose summaries are what /api/screen would actually consume; the curated
   PATIENT_RESULTS below are a hand-authored stand-in for what reasonTrial()
   would return for them, not a re-derivation of this text. */
export const SAMPLE_PATIENT_INPUTS: PatientInput[] = [
  {
    id: "Rm 214 — J.O.",
    summary:
      "58F, HR+/HER2- (ER 95%, PR 70%, IHC 0) metastatic breast cancer, stage IV. 1L letrozole+palbociclib → PD. PIK3CA H1047R+. ECOG 0. No prior AKT inhibitor.",
  },
  {
    id: "Rm 118 — A.K.",
    summary:
      "64F, HR+/HER2- metastatic breast cancer. 1L anastrozole+ribociclib → progression 3 months ago. ECOG 1. PIK3CA/AKT1/PTEN status not yet tested.",
  },
  {
    id: "Rm 305 — M.T.",
    summary:
      "71F, HR+/HER2- metastatic breast cancer, ER 88%/PR 40%. 1L letrozole+palbociclib → PD. PIK3CA H1047R+. ECOG 2 (recent decline after a fall).",
  },
  {
    id: "Rm 402 — S.R.",
    summary:
      "60F, HR+/HER2- metastatic breast cancer. Received capivasertib on a prior investigational protocol (2024), then progressed. PIK3CA E545K+. ECOG 1.",
  },
  {
    id: "Rm 118 — D.P.",
    summary: "55M, HR+/HER2- male breast cancer, metastatic. 1L tamoxifen+abemaciclib → PD. PIK3CA H1047R+. ECOG 1.",
  },
  {
    id: "Outpt f/u — B.W.",
    summary: "82F, HR+/HER2- metastatic breast cancer, PIK3CA H1047R+. 1L letrozole+palbociclib → PD. ECOG 1.",
  },
];

/* ---- authored per-patient ledgers ----------------------------------------
   Status/openCount/hardFailCount/metCount are all DERIVED below from these
   criteria via lib/verdict.ts — never hand-typed. */

type Seed = {
  id: string;
  headline: string;
  criteria: Criterion[];
};

const REASONED_SEEDS: Seed[] = [
  /* ---- ELIGIBLE ---- */
  {
    id: "Rm 214 — J.O.",
    headline: "Meets every criterion on record — PIK3CA-altered, ECOG 0, no prior AKT inhibitor.",
    criteria: [
      c("incl", "meets", "HR-positive, HER2-negative advanced breast cancer", "ER 95% / PR 70%, HER2 IHC 0."),
      c("incl", "meets", "Progression on/after an aromatase inhibitor ± CDK4/6 inhibitor", "Progressed on 1L letrozole + palbociclib."),
      c("incl", "meets", "Qualifying PI3K/AKT pathway alteration (PIK3CA/AKT1/PTEN)", "PIK3CA H1047R positive."),
      c("incl", "meets", "ECOG performance status 0–1", "ECOG 0."),
      c("excl", "clear", "No prior AKT inhibitor", "No prior capivasertib or other AKT inhibitor."),
    ],
  },
  /* ---- UNCERTAIN — genuine data gap ---- */
  {
    id: "Rm 118 — A.K.",
    headline: "Treatment history fits; the record doesn't yet show a PI3K/AKT pathway result, which this trial keys on.",
    criteria: [
      c("incl", "meets", "HR-positive, HER2-negative advanced breast cancer", "HR-positive on record; HER2-negative."),
      c("incl", "meets", "Progression on/after an aromatase inhibitor ± CDK4/6 inhibitor", "Progressed on 1L anastrozole + ribociclib, 3 months ago."),
      c(
        "incl",
        "confirm",
        "Qualifying PI3K/AKT pathway alteration (PIK3CA/AKT1/PTEN)",
        "No PIK3CA/AKT1/PTEN test result in the record — order or confirm before screening.",
      ),
      c("incl", "meets", "ECOG performance status 0–1", "ECOG 1."),
      c("excl", "clear", "No prior AKT inhibitor", "No prior capivasertib or other AKT inhibitor."),
    ],
  },
  /* ---- NEAR — a single settled failure (fixed for this patient) ---- */
  {
    id: "Rm 305 — M.T.",
    headline: "Ruled out on performance status — ECOG 2 does not meet the trial's 0–1 requirement.",
    criteria: [
      c("incl", "meets", "HR-positive, HER2-negative advanced breast cancer", "ER 88% / PR 40%, HER2-negative."),
      c("incl", "meets", "Progression on/after an aromatase inhibitor ± CDK4/6 inhibitor", "Progressed on 1L letrozole + palbociclib."),
      c("incl", "meets", "Qualifying PI3K/AKT pathway alteration (PIK3CA/AKT1/PTEN)", "PIK3CA H1047R positive."),
      // Not remediable: a performance-status decline from a fall is not something
      // this patient can "come to satisfy" on the trial's timeline. Fixed, not "not yet".
      c("incl", "fails", "ECOG performance status 0–1", "ECOG 2, following a recent fall.", false),
      c("excl", "clear", "No prior AKT inhibitor", "No prior capivasertib or other AKT inhibitor."),
    ],
  },
  /* ---- NEAR — a settled failure (fixed) on prior therapy ---- */
  {
    id: "Rm 402 — S.R.",
    headline: "Ruled out: already received an AKT inhibitor on a prior protocol — this trial excludes that.",
    criteria: [
      c("incl", "meets", "HR-positive, HER2-negative advanced breast cancer", "HR-positive, HER2-negative, metastatic."),
      c("incl", "meets", "Qualifying PI3K/AKT pathway alteration (PIK3CA/AKT1/PTEN)", "PIK3CA E545K positive."),
      c("incl", "meets", "ECOG performance status 0–1", "ECOG 1."),
      // Prior exposure to the exact drug class under study — a fact of the
      // treatment history, nothing to "come to satisfy". Fixed, not "not yet".
      c("excl", "fails", "No prior AKT inhibitor", "Received capivasertib on a prior investigational protocol (2024).", false),
    ],
  },
];

/* Structural exclusions — deterministic, no model call, no ledger. Mirrors the
 * exact reason format structuralExclusion() produces in lib/structuralGate.ts. */
const EXCLUDED_SEEDS: { id: string; reason: string }[] = [
  { id: "Rm 118 — D.P.", reason: "Enrolls female participants only." },
  { id: "Outpt f/u — B.W.", reason: "Maximum age is 80 Years; the record gives age 82." },
];

function mkReasoned(s: Seed): PatientResult {
  const criteria = s.criteria;
  return {
    id: s.id,
    status: deriveStatus(criteria),
    headline: s.headline,
    criteria,
    metCount: metCountOf(criteria),
    total: criteria.length,
    openCount: openCountOf(criteria),
    hardFailCount: hardFailCountOf(criteria),
    structuralExclusion: null,
  };
}

function mkExcluded(s: { id: string; reason: string }): PatientResult {
  return {
    id: s.id,
    status: "excluded",
    headline: s.reason,
    criteria: [],
    metCount: 0,
    total: 0,
    openCount: 0,
    hardFailCount: 0,
    structuralExclusion: s.reason,
  };
}

/** Deterministic, instant cohort-screen result for the sample cohort — built
 *  the same way the route builds a real one (derive, then sort, then count),
 *  just without a network call or a model call anywhere in the path. */
export function sampleScreenResult(): ScreenResponse {
  const patients: PatientResult[] = [...REASONED_SEEDS.map(mkReasoned), ...EXCLUDED_SEEDS.map(mkExcluded)];
  patients.sort(compareCohortPatients);
  return {
    trial: SAMPLE_TRIAL,
    counts: cohortCounts(patients),
    patients,
  };
}
