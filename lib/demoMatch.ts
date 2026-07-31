/* ============================================================================
   Demo fixture — deterministic match result for the "Margaret" sample patient.

   Live matching (fail-closed + confirm-is-first-class) rarely yields a clean
   "eligible" from a terse note, which makes the demo unreliable. When the sample
   patient is used (client sends `demo: "margaret"` to /api/match), we return
   this curated, instant, always-identical result instead of calling the model.
   Every other input still runs the real live pipeline.

   The trials are REAL ClinicalTrials.gov studies in Margaret's exact space
   (HR+/HER2-, PIK3CA-mutant, HER2-low, post-CDK4/6) so the deep links resolve;
   the ledgers are hand-authored to demonstrate the product: 3 eligible, 1
   uncertain (a genuine data gap → "confirm"), 1 ruled-out (fail-closed).
   Illustrative for the demo persona only — not a live eligibility determination.
   ========================================================================== */

import type { TrialMatch, Trial, Criterion, DecisionBrief, DecisionFactors } from "@/lib/types";
import { deriveStatus, metCountOf } from "@/lib/verdict";

/** Mirrors the /api/match response shape the client consumes (defined inline in
 *  page.tsx as MatchResponse). Kept local so the fixture stays self-contained. */
type DemoMatchResponse = {
  conditionQuery: string;
  summary: string;
  /** How this result was produced. The fixture must say so: the results screen
   *  otherwise captions every result "AI-generated eligibility" and reports a
   *  live screen that did not happen, against real NCT ids and real sponsors. */
  provenance: "curated-demo";
  counts: { poolTotal: number; reasoned: number; eligible: number; uncertain: number; near: number; screened: number; excluded: number };
  coverage: { terms: { term: string; added: number; error: string | null }[]; triaged: boolean };
  location: { applied: boolean; label: string; travel: "local" | "regional" | "any" | null; inRange: number };
  matches: TrialMatch[];
};

/** `remediable` defaults to false: it is only read on a "fails" verdict, and
 *  false is the conservative reading there ("this is a no", not "not yet"). */
const c = (
  kind: "incl" | "excl",
  verdict: Criterion["verdict"],
  requirement: string,
  evidence: string,
  provenance: Criterion["provenance"] = "note",
  remediable = false,
): Criterion => ({ kind, verdict, requirement, evidence, provenance, remediable });

const DFCI = { facility: "Dana-Farber Cancer Institute", city: "Boston", state: "Massachusetts", country: "United States", status: "RECRUITING", contacts: [] };
const MGH = { facility: "Massachusetts General Hospital", city: "Boston", state: "Massachusetts", country: "United States", status: "RECRUITING", contacts: [] };
const BIDMC = { facility: "Beth Israel Deaconess Medical Center", city: "Boston", state: "Massachusetts", country: "United States", status: "RECRUITING", contacts: [] };

function phaseRank(phase: string): number {
  const p = phase.toLowerCase();
  if (p.includes("4")) return 4;
  if (p.includes("3")) return 3;
  if (p.includes("2")) return 2;
  if (p.includes("1")) return 1;
  return 0;
}

type Seed = {
  nctId: string;
  title: string;
  phase: string;
  sponsor: string;
  interventions: { type: string; name: string }[];
  enrollment: number;
  primaryCompletionDate: string;
  enrollmentWindow: string;
  headline: string;
  criteria: Criterion[];
  brief: DecisionBrief | null;
  locations?: typeof DFCI[];
};

function mk(t: Seed): TrialMatch {
  const criteria = t.criteria;
  const locations = t.locations ?? [DFCI, MGH];
  const base: Trial = {
    nctId: t.nctId,
    title: t.title,
    officialTitle: t.title,
    phase: t.phase,
    studyType: "INTERVENTIONAL",
    overallStatus: "RECRUITING",
    sponsor: t.sponsor,
    conditions: ["HR-positive HER2-negative Breast Cancer", "Metastatic Breast Cancer"],
    eligibilityCriteria: "See ClinicalTrials.gov for the full verbatim inclusion/exclusion criteria.",
    sex: "FEMALE",
    minimumAge: "18 Years",
    maximumAge: "",
    stdAges: ["ADULT", "OLDER_ADULT"],
    locations,
    url: `https://clinicaltrials.gov/study/${t.nctId}`,
    startDate: "2023-01",
    primaryCompletionDate: t.primaryCompletionDate,
    completionDate: "2028-06",
    lastUpdatePostDate: "2026-06-01",
    registry: "ClinicalTrials.gov",
    contacts: [],
    randomized: true,
    masked: false,
    primaryPurpose: "Treatment",
    interventional: true,
    enrollment: t.enrollment,
    interventions: t.interventions,
  };
  const factors: DecisionFactors = {
    phaseRank: phaseRank(t.phase),
    randomized: true,
    interventional: true,
    nearestSite: "Boston, Massachusetts",
    nearestSiteActive: true,
    proximityScore: 4, // same city — see lib/geo for the band scale
    burdenProxy: 1,
    withinRange: null,
    locationUnknown: false,
    enrollmentWindow: t.enrollmentWindow,
    registryAgeDays: 0,
    registryStale: false,
  };
  return {
    ...base,
    status: deriveStatus(criteria),
    headline: t.headline,
    criteria,
    metCount: metCountOf(criteria),
    total: criteria.length,
    brief: t.brief,
    factors,
    structuralExclusion: null,
    triageScore: null,
  };
}

const SEEDS: Seed[] = [
  /* ---- ELIGIBLE 1 — AKT inhibitor, PIK3CA-driven ---- */
  {
    nctId: "NCT04305496",
    title: "Capivasertib + Fulvestrant in HR+/HER2- Advanced Breast Cancer (CAPItello-291)",
    phase: "Phase 3",
    sponsor: "AstraZeneca",
    interventions: [
      { type: "Drug", name: "Capivasertib" },
      { type: "Drug", name: "Fulvestrant" },
    ],
    enrollment: 708,
    primaryCompletionDate: "2026-12",
    enrollmentWindow: "Open now · est. closes before ~Dec 2026",
    headline: "You meet every criterion we could check — the PIK3CA/AKT pathway alteration this trial targets is documented.",
    criteria: [
      c("incl", "meets", "HR-positive, HER2-negative advanced breast cancer", "ER 90% / PR 60%, HER2 IHC 1+ (negative), stage IV.", "note"),
      c("incl", "meets", "Progression on/after an aromatase inhibitor ± CDK4/6 inhibitor", "Progressed on 1L letrozole + palbociclib (Dec 2025).", "note"),
      c("incl", "meets", "Qualifying PI3K/AKT pathway alteration (PIK3CA/AKT1/PTEN)", "PIK3CA H1047R positive.", "note"),
      c("incl", "meets", "ECOG performance status 0–1", "ECOG 1.", "note"),
      c("excl", "clear", "No prior AKT inhibitor", "No prior capivasertib or other AKT inhibitor.", "note"),
    ],
    brief: {
      offers: "Adds an AKT inhibitor to fulvestrant — a targeted option for the PIK3CA alteration in your tumor after CDK4/6 progression.",
      commitment: "Randomized (you may receive fulvestrant plus placebo), open-label fulvestrant backbone, clinic visits for injections and monitoring.",
      uncertainty: "A Phase 3 study — whether capivasertib improves outcomes for you specifically is what it is measuring.",
      questionsToAsk: [
        "Which arm would I be randomized to, and how is that decided?",
        "How often are visits and scans, and where?",
      ],
    },
  },
  /* ---- ELIGIBLE 2 — HER2-low ADC (she is IHC 1+) ---- */
  {
    nctId: "NCT03734029",
    title: "Trastuzumab Deruxtecan in HER2-Low Metastatic Breast Cancer (DESTINY-Breast04)",
    phase: "Phase 3",
    sponsor: "Daiichi Sankyo / AstraZeneca",
    interventions: [
      { type: "Drug", name: "Trastuzumab deruxtecan (T-DXd)" },
    ],
    enrollment: 557,
    primaryCompletionDate: "2027-03",
    enrollmentWindow: "Open now · est. closes before ~Mar 2027",
    headline: "Your HER2 IHC 1+ result makes you HER2-low — the exact population this trial enrolls.",
    criteria: [
      c("incl", "meets", "HER2-low disease (IHC 1+, or IHC 2+/ISH-negative)", "HER2 IHC 1+ = HER2-low.", "note"),
      c("incl", "meets", "HR-positive, previously treated with endocrine therapy", "ER/PR-positive; prior letrozole and fulvestrant.", "note"),
      c("incl", "meets", "Endocrine-refractory / progression on prior endocrine therapy", "Progressed through two lines of endocrine-based therapy.", "note"),
      c("incl", "meets", "ECOG performance status 0–1", "ECOG 1.", "note"),
      c("excl", "clear", "No prior anti-HER2 therapy or HER2-directed ADC", "No prior trastuzumab deruxtecan or other anti-HER2 agent.", "note"),
    ],
    brief: {
      offers: "An antibody-drug conjugate for HER2-low disease — a distinct mechanism from the endocrine therapies you have had.",
      commitment: "IV infusions on a cycle, with scans and monitoring for lung-related side effects.",
      uncertainty: "Phase 3; your individual benefit is not known in advance and is what the study measures.",
      questionsToAsk: [
        "What monitoring is needed for the lung risk with this drug?",
        "How does this option compare in timing to the targeted-therapy trials?",
      ],
    },
  },
  /* ---- ELIGIBLE 3 — TROP2 ADC, HR+/HER2- ---- */
  {
    nctId: "NCT04482309",
    title: "Datopotamab Deruxtecan vs Chemotherapy in HR+/HER2- Metastatic Breast Cancer (TROPION-Breast01)",
    phase: "Phase 3",
    sponsor: "AstraZeneca / Daiichi Sankyo",
    interventions: [
      { type: "Drug", name: "Datopotamab deruxtecan (Dato-DXd)" },
    ],
    enrollment: 732,
    primaryCompletionDate: "2026-09",
    enrollmentWindow: "Open now · est. closes before ~Sep 2026",
    headline: "You match the inoperable HR+/HER2-, endocrine-refractory population this ADC trial enrolls.",
    criteria: [
      c("incl", "meets", "Inoperable or metastatic HR-positive, HER2-negative breast cancer", "Stage IV HR+/HER2- disease.", "note"),
      c("incl", "meets", "Progression on endocrine therapy; not a candidate for further endocrine therapy", "Progressed on letrozole+palbociclib and on fulvestrant.", "note"),
      c("incl", "meets", "Endocrine-refractory per investigator", "Two prior endocrine-based lines with progression.", "note"),
      c("incl", "meets", "ECOG performance status 0–1", "ECOG 1.", "note"),
      c("excl", "clear", "No prior TROP2-directed antibody-drug conjugate", "No prior datopotamab or sacituzumab govitecan.", "note"),
    ],
    brief: {
      offers: "A TROP2-directed antibody-drug conjugate compared against standard chemotherapy for endocrine-refractory disease.",
      commitment: "Randomized against chemotherapy; IV infusions, scans, and side-effect monitoring.",
      uncertainty: "Phase 3; you could be assigned to the chemotherapy arm, and individual benefit is unproven.",
      questionsToAsk: [
        "If randomized to chemotherapy, which regimen would that be?",
        "What are the main side effects to weigh against the other trials?",
      ],
    },
  },
  /* ---- UNCERTAIN — genuine data gap surfaces as "confirm" ---- */
  {
    nctId: "NCT03778931",
    title: "Elacestrant in ER+/HER2- Advanced Breast Cancer (EMERALD)",
    phase: "Phase 3",
    sponsor: "Stemline / Menarini",
    interventions: [{ type: "Drug", name: "Elacestrant (oral SERD)" }],
    enrollment: 478,
    primaryCompletionDate: "2026-11",
    enrollmentWindow: "Open now · est. closes before ~Nov 2026",
    headline: "A strong fit on treatment history — but the record does not show your ESR1 mutation status, which this trial keys on.",
    criteria: [
      c("incl", "meets", "ER-positive, HER2-negative advanced breast cancer", "ER 90%, HER2 IHC 1+ (negative).", "note"),
      c("incl", "meets", "Progression on prior endocrine therapy + a CDK4/6 inhibitor", "Post letrozole+palbociclib and fulvestrant.", "note"),
      c("incl", "confirm", "ESR1 mutation detected by ctDNA", "The record does not document an ESR1 mutation test — order/confirm before screening.", "not_documented"),
      c("incl", "confirm", "Adequate hematologic and hepatic function within 14 days", "Recent CBC and liver panel are not in the record.", "not_documented"),
      c("excl", "clear", "No prior oral SERD (e.g., elacestrant)", "No prior elacestrant.", "note"),
    ],
    brief: {
      offers: "An oral selective estrogen receptor degrader — most relevant if an ESR1 mutation is present.",
      commitment: "Oral daily therapy with periodic monitoring visits.",
      uncertainty: "Eligibility hinges on ESR1 status, which has not been tested yet.",
      questionsToAsk: [
        "Can we send ctDNA to check for an ESR1 mutation?",
        "What recent labs are needed to complete screening?",
      ],
    },
  },
  /* ---- NEAR / RULED OUT — fail-closed, cites the driving criterion ---- */
  {
    nctId: "NCT04191499",
    title: "Inavolisib + Palbociclib + Fulvestrant, First-Line PIK3CA-Mutated HR+/HER2- (INAVO120)",
    phase: "Phase 3",
    sponsor: "Genentech / Roche",
    interventions: [
      { type: "Drug", name: "Inavolisib" },
      { type: "Drug", name: "Palbociclib" },
      { type: "Drug", name: "Fulvestrant" },
    ],
    enrollment: 325,
    primaryCompletionDate: "2027-06",
    enrollmentWindow: "Open now · est. closes before ~Jun 2027",
    headline: "Ruled out: this is a first-line study and you have already received a CDK4/6 inhibitor for metastatic disease.",
    criteria: [
      c("incl", "meets", "PIK3CA-mutated HR-positive, HER2-negative breast cancer", "PIK3CA H1047R positive; ER/PR+, HER2 IHC 1+.", "note"),
      // Not remediable: prior exposure is a fact of the treatment history and
      // nothing the patient does from here can undo it. This is a "no", not a
      // "not yet" — the distinction the ruled-out section is sorted on.
      c("excl", "fails", "No prior CDK4/6 inhibitor in the advanced/metastatic setting", "Received palbociclib as first-line therapy for metastatic disease (2024).", "note", false),
      c("incl", "meets", "ECOG performance status 0–1", "ECOG 1.", "note"),
      c("incl", "meets", "Measurable or evaluable metastatic disease", "Stage IV metastatic disease.", "note"),
    ],
    brief: {
      offers: "Adds a PI3K inhibitor in the first-line setting — but it enrolls patients who have not yet had a CDK4/6 inhibitor for metastatic disease.",
      commitment: "Not applicable — the prior-therapy criterion is not met.",
      uncertainty: "The exclusion is based on documented prior palbociclib; confirm with the care team if there is any question.",
      questionsToAsk: [
        "Are there second-line PI3K-inhibitor trials open to me instead?",
      ],
    },
  },
];

/** Deterministic, instant match result for the Margaret sample patient. */
export function margaretDemoMatch(summary?: string): DemoMatchResponse {
  const matches = SEEDS.map(mk);
  const reasoned = matches; // all authored (no "screened" tier in the fixture)
  return {
    provenance: "curated-demo",
    conditionQuery: "HR-positive, HER2-negative metastatic breast cancer",
    summary: summary ?? "61F, HR+/HER2- metastatic breast cancer, PIK3CA H1047R+, post-CDK4/6 and fulvestrant.",
    counts: {
      poolTotal: matches.length,
      reasoned: reasoned.length,
      eligible: matches.filter((m) => m.status === "eligible").length,
      uncertain: matches.filter((m) => m.status === "uncertain").length,
      near: matches.filter((m) => m.status === "near").length,
      screened: 0,
      excluded: 0,
    },
    // The fixture is authored, not retrieved — say so rather than fabricating
    // the search legs a live run would report.
    coverage: { terms: [], triaged: false },
    location: { applied: false, label: "Boston, MA", travel: null, inRange: 0 },
    matches,
  };
}
