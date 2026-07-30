/* ============================================================================
   Trialign — shared domain types

   These describe the data that flows between the server route handlers and the
   React UI. The Zod schemas in schemas.ts describe what Claude is asked to
   return; the types here describe what the UI consumes after normalization.
   ========================================================================== */

/** A contact for a trial or site (central or per-site), from ClinicalTrials.gov. */
export type TrialContact = {
  name: string;
  role: string; // "CONTACT" | "PRINCIPAL_INVESTIGATOR" | …
  phone: string;
  email: string;
};

/** One recruiting site for a trial, pulled live from ClinicalTrials.gov. */
export type TrialLocation = {
  facility: string;
  city: string;
  state: string;
  country: string;
  status: string;
  /** Per-site contacts, when the registry lists them (Connect §6). */
  contacts: TrialContact[];
};

/** A trial normalized from a ClinicalTrials.gov v2 study record. */
export type Trial = {
  nctId: string;
  title: string;
  officialTitle: string;
  phase: string; // "Phase 2", "Phase 1/2", "N/A", …
  studyType: string;
  overallStatus: string; // "RECRUITING"
  sponsor: string;
  conditions: string[];
  /** Raw inclusion/exclusion prose — the raw material for the criterion ledger. */
  eligibilityCriteria: string;
  sex: string;
  minimumAge: string;
  /** Upper age bound, e.g. "75 Years", or "" when the study sets none. */
  maximumAge: string;
  stdAges: string[];
  locations: TrialLocation[];
  /** Deep link to the study on ClinicalTrials.gov. */
  url: string;

  /* ---- timing signals (statusModule) — power the enrollment-window estimate ---- */
  /** Study start date, "YYYY-MM" or "YYYY-MM-DD", or "" if unpublished. */
  startDate: string;
  /** Primary completion (last primary-outcome measurement) date, or "". */
  primaryCompletionDate: string;
  /** Overall study completion date, or "". */
  completionDate: string;
  /** Registry record last-update post date, "YYYY-MM-DD" or "" — powers the
   *  Connect §6 staleness warning ("last updated N months ago"). */
  lastUpdatePostDate: string;
  /** Which registry this record came from — "ClinicalTrials.gov" today. */
  registry: string;

  /** Central study contacts (name/phone/email), for Connect §6 routing. */
  contacts: TrialContact[];

  /* ---- design signals that power the decision-support layer ---- */
  /** true when the study allocates participants randomly (arm not chosen by you). */
  randomized: boolean;
  /** true when the study is blinded/masked (placebo or unknown-arm possible). */
  masked: boolean;
  /** e.g. "Treatment", "Diagnostic", "Prevention", "Supportive Care", "" */
  primaryPurpose: string;
  /** true = interventional (a treatment/procedure); false = observational (data only). */
  interventional: boolean;
  /** target enrollment count, or 0 if unpublished. */
  enrollment: number;
  /** what's being tested, e.g. { type: "Drug", name: "Sacituzumab govitecan" }. */
  interventions: { type: string; name: string }[];
};

/** A single criterion verdict in the ledger.
 *  meets/clear satisfy; confirm = insufficient info (a coordinator to-do);
 *  fails = not met. "clear" is an exclusion that is NOT triggered. */
export type Verdict = "meets" | "clear" | "confirm" | "fails";

/** Where the evidence for a criterion's judgment came from (Connect §3).
 *  "not_documented" = nothing in the record addresses it (pairs with "confirm"). */
export type CriterionProvenance = "fhir" | "note" | "you" | "not_documented";

export type Criterion = {
  kind: "incl" | "excl";
  verdict: Verdict;
  requirement: string;
  evidence: string;
  provenance: CriterionProvenance;
  /** Only meaningful when verdict === "fails". true = the patient could come to
   *  meet this (a washout that elapses, a scan that gets ordered, a lab that is
   *  redrawn); false = it is fixed for this patient (sex, age band, disease type,
   *  an irreversible prior therapy). Drives the "possibly resolvable" vs
   *  "definitively ruled out" split that a coordinator actually triages on.
   *  Descriptive only — it never changes the verdict or the derived status. */
  remediable: boolean;
};

/** Overall standing of a trial for this patient.
 *  - "eligible"  : every extracted criterion is satisfied.
 *  - "uncertain" : no failures, but open "confirm" items remain.
 *  - "near"      : at least one failing criterion (see Criterion.remediable for
 *                  whether the failures are resolvable).
 *  - "screened"  : passed the structural gates but was not reasoned over this
 *                  pass (we deep-reason the top N per search).
 *  - "excluded"  : ruled out by a DETERMINISTIC structural gate (age band, sex)
 *                  before any model call — no ledger, no ambiguity. */
export type MatchStatus = "eligible" | "near" | "uncertain" | "screened" | "excluded";

/** A patient-facing decision brief — grounded in the trial's real attributes and
 *  the eligibility ledger. Non-directive: it frames the choice, never makes it. */
export type DecisionBrief = {
  /** What this trial could offer / is studying (potential, honest, phase-aware). */
  offers: string;
  /** What it asks of you — visits, randomization/placebo, procedures, travel, length. */
  commitment: string;
  /** What's experimental or unknown, phase-appropriate. */
  uncertainty: string;
  /** 2–3 concrete questions to bring to the care team. */
  questionsToAsk: string[];
};

/** Deterministic decision factors, computed in code (not from the model) so the
 *  optional preference re-ranking stays explainable. */
export type DecisionFactors = {
  /** 0 (N/A / observational) … 4 (Phase 4). Higher = more established. */
  phaseRank: number;
  randomized: boolean;
  interventional: boolean;
  /** Human label for the closest site, e.g. "Boston, Massachusetts" or "No nearby site". */
  nearestSite: string;
  /** false when the closest site we could name is NOT itself recruiting (the
   *  study is open but that particular site is withdrawn/suspended/completed).
   *  The UI must caveat the site line when this is false — otherwise we send a
   *  patient to a closed door. */
  nearestSiteActive: boolean;
  /** 4 same city · 3 same state · 2 neighboring state · 1 same country ·
   *  0 unknown/none. Approximate — we place sites at city/state granularity. */
  proximityScore: number;
  /** Rough 0 (low) … 2 (higher) burden estimate from study type + phase. Approximate. */
  burdenProxy: number;
  /** true when the closest listed site is within the patient's chosen travel radius.
   *  null when no distance preference was set or the patient location is unknown. */
  withinRange: boolean | null;
  /** true when the trial lists no site we could place against the patient's location. */
  locationUnknown: boolean;
  /** Human-readable, explicitly-estimated enrollment window, e.g.
   *  "Open now · est. closes ~Mar 2026". "" when no dates are published. */
  enrollmentWindow: string;
  /** Days since the registry record was last updated, or null when unpublished.
   *  A study can sit at RECRUITING long after it stopped enrolling; how fresh
   *  the record is, is the only published signal a patient has about that. */
  registryAgeDays: number | null;
  /** true when the record has not been touched in over ~6 months. Surfaced in
   *  the UI and de-prioritized in ranking — never used to hide a trial. */
  registryStale: boolean;
};

/** A trial plus its per-criterion reasoning and decision-support layer —
 *  what the results screen renders. */
export type TrialMatch = Trial & {
  status: MatchStatus;
  headline: string;
  criteria: Criterion[];
  metCount: number;
  total: number;
  /** Patient-facing brief; null for screened trials we didn't reason over. */
  brief: DecisionBrief | null;
  /** Deterministic factors for the at-a-glance row and preference re-ranking. */
  factors: DecisionFactors;
  /** Set only when status === "excluded": the plain-language reason a code-level
   *  structural gate ruled this study out before any model call, e.g.
   *  "Enrolls females only". null for every other status. */
  structuralExclusion: string | null;
  /** 0 = unlikely · 1 = possible · 2 = likely, from the cheap triage pass that
   *  decides WHICH trials get deep reasoning. null when triage did not run.
   *  Ordering signal only — it never contributes to a verdict or a status. */
  triageScore: number | null;
};
