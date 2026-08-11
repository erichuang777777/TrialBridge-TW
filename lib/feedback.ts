/* ============================================================================
   Trialign — the screening-failure feedback loop, as a file round-trip.

   From docs/roadmap-patient-clinician.md, "Deferred, and why":

     Screening-failure feedback loop — A coordinator learns, post-screening,
     that a patient actually failed on X. That is the single most valuable
     input the eval harness lacks — it is how the gold set stops being
     AUTHORED and starts being CLINICALLY ADJUDICATED. Nowhere to put it
     today.

   "Nowhere to put it" meant no storage. It does not need storage: a
   coordinator's correction can leave the browser as a downloaded JSON file
   and be dropped straight into evals/cases/ as a new gold case, the same way
   a screenshot or a CSV export already leaves this app. This module is the
   whole mechanism — a plain, dependency-free, unit-testable bridge between
   what a coordinator observes at /screen and what evals/ledger.ts consumes.

   Two invariants this file exists to hold:

   1. THE CORRECTION IS THE CLINICIAN'S CLAIM, NOT THE APP'S. `appStatus` is
      carried for the record, but `trueStatus` is never defaulted from it —
      every builder here requires the caller to state it. `confirmsApp` is
      *derived*, not accepted as an untrusted flag, so it can never drift from
      the data it describes. A correction the coordinator never actually made
      cannot exist here: there is no "unset" value for `trueStatus` that
      would masquerade as a real answer.

   2. AN UNREVIEWED CASE AND AN ADJUDICATED-CORRECT CASE ARE NOT THE SAME
      THING. There is no way to construct a ScreeningCorrection except by
      calling buildCorrection with an explicit trueStatus — so "no feedback
      given" is represented by the absence of a ScreeningCorrection value
      entirely, never by a correction whose fields happen to equal the app's
      own answer. A confirmation ("the app was right") is still a real,
      dated, attributed clinical judgment — distinguishable in the exported
      JSON (`confirmsApp: true`) from a case nobody has looked at yet.

   Zero persistence, same as the rest of the app: nothing in this module
   reads or writes a filesystem, a database, or localStorage. It only shapes
   data in memory and returns strings. Where the correction actually goes
   (a downloaded file, then — at a human's discretion — a git commit into
   evals/cases/adjudicated/) is entirely outside this module and outside the
   app's runtime.
   ========================================================================== */

import type { Criterion, MatchStatus, Trial } from "@/lib/types";
import type { PatientResult, ScreenTrialSummary } from "@/lib/screenTypes";

/** The three statuses a clinical reviewer can actually adjudicate a patient
 *  into — deliberately the same union evals/cases/ledger-cases.ts uses for
 *  `expected`, so a correction's `trueStatus` is, by construction, always a
 *  legal gold-case expectation. "screened" (no eligibility text) and
 *  "excluded" (a deterministic structural gate, not a clinical judgment) are
 *  not reviewable outcomes — see `isAdjudicable` below, which the UI uses to
 *  decide which rows even offer this affordance. */
export type CorrectedStatus = "eligible" | "uncertain" | "near";

/** Only "eligible" | "uncertain" | "near" rows were actually reasoned over by
 *  a model and can be adjudicated. "screened" (no criteria to judge) and
 *  "excluded" (ruled out by code before any model call) are not clinical
 *  judgments in the first place, so there is nothing for a coordinator to
 *  confirm or correct. */
export function isAdjudicable(status: MatchStatus): status is CorrectedStatus {
  return status === "eligible" || status === "uncertain" || status === "near";
}

/** The specific criterion a coordinator says the patient actually failed on,
 *  in their own words — required whenever trueStatus is "near", because a
 *  bucket alone ("ruled out") is not the datum the roadmap asked for; the
 *  criterion is. `appNamedIt` records whether the app's own ledger already
 *  carried a FAILING criterion naming the same thing: a coordinator can
 *  agree with the bucket (near) while pointing out the app failed the
 *  patient for the wrong reason, and that distinction is worth keeping. */
export type TrueFailure = {
  requirement: string;
  appNamedIt: boolean;
};

/** WHY the screen and the truth diverged. Without this the correction cannot
 *  be turned into a gold case honestly, because the three answers below need
 *  three different treatments and two of them are not interchangeable:
 *
 *  - "published-criteria" — the deciding fact was in the criteria the app had
 *    and in the record it screened, and it read them wrong. A clean eval case:
 *    same inputs, better answer expected.
 *
 *  - "criterion-missing" — the criterion is in the study's published text but
 *    never reached this patient's ledger. Also a real eval case, but only once
 *    the criterion is put back into the trial text the case carries. Otherwise
 *    the case asks the model to fail on a requirement it was never shown, and
 *    is unsatisfiable by construction rather than hard.
 *
 *  - "outside-the-record" — the deciding fact was not in the record at
 *    screening time (a scan taken later, an undocumented history). This is
 *    real, valuable feedback and it is NOT a gold case: a model reasoning over
 *    a profile that never mentioned the fact SHOULD reach the app's answer.
 *    Scoring it as a miss would make the harness punish correct reasoning and
 *    quietly corrupt the false-eligible rate — the one number the whole suite
 *    exists to produce. So it is exported, kept, and excluded from the gold
 *    set, visibly. */
export type CorrectionBasis = "published-criteria" | "criterion-missing" | "outside-the-record";

export const CORRECTION_BASES: CorrectionBasis[] = ["published-criteria", "criterion-missing", "outside-the-record"];

/** Only the first two describe a divergence the model could have avoided from
 *  the inputs it had — so only those become gold cases. */
export function basisIsGoldable(basis: CorrectionBasis): boolean {
  return basis === "published-criteria" || basis === "criterion-missing";
}

/** Whether a correction may be scored.
 *
 *  When a basis is stated it governs, even on a confirmation — a coordinator
 *  can agree with the bucket ("near") while saying the patient actually failed
 *  on something else entirely, and if that something else was outside the
 *  record, the case is no more scorable than an outright disagreement would
 *  be. Only a bare confirmation with nothing to explain is goldable on the
 *  strength of the agreement alone. */
export function goldable(c: Pick<ScreeningCorrection, "confirmsApp" | "basis">): boolean {
  return c.basis === null ? c.confirmsApp : basisIsGoldable(c.basis);
}

/** One coordinator's claim about what actually happened at this patient's
 *  screening, for this trial. This is the datum the roadmap calls "the
 *  single most valuable input the eval harness lacks" — everything else in
 *  this module exists to get it into evals/cases/ intact. */
export type ScreeningCorrection = {
  /** Tags this object's shape so a loader can tell it apart from any other
   *  JSON a human might drop in the same directory. */
  kind: "trialign-screening-correction";
  schemaVersion: 1;
  patientId: string;
  trialNctId: string;
  /** What /api/screen derived for this patient — carried for the record
   *  only. Never read as ground truth by anything downstream of here. */
  appStatus: MatchStatus;
  /** The clinician's claim: what the patient's status actually was. This is
   *  the number the eval's `expected` field becomes — see toLedgerCase(). */
  trueStatus: CorrectedStatus;
  /** true when trueStatus === appStatus — i.e. the coordinator's review
   *  landed on the same bucket the app derived. ALWAYS computed by
   *  buildCorrection, never accepted as an input, so this can never say
   *  "confirmed" about a correction that actually disagrees. */
  confirmsApp: boolean;
  /** Set only when trueStatus === "near" (a failure needs a criterion to
   *  attach to); null otherwise. Never guessed — buildCorrection refuses to
   *  construct a "near" correction without one. */
  trueFailure: TrueFailure | null;
  /** Why the screen and the truth diverged — see CorrectionBasis. Required
   *  whenever the coordinator disagrees with the app, because it decides
   *  whether this correction can become a gold case at all. null only when
   *  the review confirmed the app's answer, where there is no divergence to
   *  explain. */
  basis: CorrectionBasis | null;
  /** Free text: what the record didn't show, or couldn't have shown. May be
   *  empty — a coordinator can adjudicate a status without narrative. */
  note: string;
  /** ISO 8601 — when this review happened, not when the file was exported
   *  (those can differ if a coordinator drafts now and downloads later). */
  reviewedAt: string;
  /** Coordinator-entered attribution (initials, role) — not sourced from
   *  anywhere else in the app, since nothing here tracks who is signed in. */
  reviewerLabel: string;
};

function statusesEqual(a: MatchStatus, b: CorrectedStatus): boolean {
  return a === b;
}

/** Construct a ScreeningCorrection. This is the ONLY way to make one, and it
 *  enforces both invariants at the point of construction rather than trusting
 *  a caller to have gotten them right:
 *    - confirmsApp is derived from trueStatus vs appStatus, never accepted;
 *    - a "near" correction must carry a trueFailure, and a non-"near"
 *      correction must not — so a caller cannot silently drop the criterion
 *      a "fails" claim is supposed to be about, and cannot attach a stray
 *      failure to an "eligible"/"uncertain" claim. */
export function buildCorrection(input: {
  patientId: string;
  trialNctId: string;
  appStatus: MatchStatus;
  trueStatus: CorrectedStatus;
  trueFailure?: TrueFailure | null;
  basis?: CorrectionBasis | null;
  note?: string;
  reviewerLabel?: string;
  now?: Date | number;
}): ScreeningCorrection {
  const trueFailure = input.trueFailure ?? null;
  if (input.trueStatus === "near" && (!trueFailure || !trueFailure.requirement.trim())) {
    throw new Error('A "near" correction must name the criterion the patient actually failed on.');
  }
  if (input.trueStatus !== "near" && trueFailure) {
    throw new Error('trueFailure only applies when trueStatus is "near" — clear it for eligible/uncertain corrections.');
  }
  const confirmsApp = statusesEqual(input.appStatus, input.trueStatus);
  const basis = input.basis ?? null;
  // A disagreement with no stated basis cannot be turned into a gold case
  // honestly — the three bases need three different treatments, and guessing
  // one would be the app deciding what the clinician meant.
  if (!confirmsApp && !basis) {
    throw new Error("A correction that disagrees with the app must say why they diverged — see CorrectionBasis.");
  }
  const now = input.now ?? Date.now();
  return {
    kind: "trialign-screening-correction",
    schemaVersion: 1,
    patientId: input.patientId,
    trialNctId: input.trialNctId,
    appStatus: input.appStatus,
    trueStatus: input.trueStatus,
    confirmsApp,
    trueFailure: trueFailure ? { requirement: trueFailure.requirement.trim(), appNamedIt: trueFailure.appNamedIt } : null,
    basis,
    note: (input.note ?? "").trim(),
    reviewedAt: new Date(now).toISOString(),
    reviewerLabel: (input.reviewerLabel ?? "").trim(),
  };
}

/* ---- reconstructing a runnable Trial from what /screen actually holds ------

   evals/cases/ledger-cases.ts's LedgerCase needs a full `Trial` — the harness
   (evals/ledger.ts) re-reasons over it from scratch via reasonTrial(), which
   reads `trial.eligibilityCriteria` (see lib/reason.ts: "ELIGIBILITY CRITERIA
   (verbatim from ClinicalTrials.gov)"). /screen's client state does NOT hold
   that text: /api/screen returns ScreenTrialSummary (lib/screenTypes.ts) —
   nctId/title/phase/sponsor/url/overallStatus/registryAgeDays/registryStale
   only — never the raw eligibility prose, and never conditions, sex,
   min/maxAge, locations, dates, or design fields either. Full stop: those are
   not reconstructable from anything the browser has.

   What the browser DOES have, per patient, is the criterion LEDGER — the
   requirement text /api/screen already extracted for this specific patient.
   reconstructTrial rebuilds an eligibility-criteria block from that ledger
   (grouped by inclusion/exclusion) and defaults every other Trial field to a
   neutral, clearly-labeled placeholder. The result satisfies the `Trial`
   type and IS runnable — reasonTrial only requires *a* criteria string to
   reason over, not the registry's own characters — but it is a
   reconstruction, not a verbatim copy, and RECONSTRUCTION_CAVEATS says so
   in the exported file itself rather than leaving it to be discovered later. */

const UNKNOWN_TRIAL_DEFAULTS = {
  officialTitle: "",
  studyType: "Interventional",
  conditions: [] as string[],
  sex: "ALL",
  minimumAge: "",
  maximumAge: "",
  stdAges: [] as string[],
  locations: [] as Trial["locations"],
  startDate: "",
  primaryCompletionDate: "",
  completionDate: "",
  lastUpdatePostDate: "",
  registry: "ClinicalTrials.gov",
  contacts: [] as Trial["contacts"],
  randomized: false,
  masked: false,
  primaryPurpose: "",
  interventional: true,
  enrollment: 0,
  interventions: [] as Trial["interventions"],
};

/** Rebuild an eligibility-criteria block from a patient's own criterion
 *  ledger — the requirement text /api/screen already extracted for them,
 *  grouped the way registry prose is conventionally grouped. Not the
 *  registry's verbatim wording; see the caveats this ships with. */
export function reconstructEligibilityCriteria(criteria: Criterion[]): string {
  const incl = criteria.filter((c) => c.kind === "incl").map((c) => `- ${c.requirement}`);
  const excl = criteria.filter((c) => c.kind === "excl").map((c) => `- ${c.requirement}`);
  const parts: string[] = [];
  if (incl.length) parts.push(`Inclusion Criteria:\n${incl.join("\n")}`);
  if (excl.length) parts.push(`Exclusion Criteria:\n${excl.join("\n")}`);
  return parts.join("\n\n");
}

/** The criteria block a gold case should carry, given the correction.
 *
 *  When the coordinator says the criterion is published but never reached this
 *  patient's ledger ("criterion-missing"), it must be added back — the ledger
 *  is the only source the block is rebuilt from, so leaving it out produces a
 *  case that asks the model to fail on a requirement it was never shown. That
 *  is not a hard case; it is an impossible one, and it would sit red forever
 *  looking like a model defect.
 *
 *  For every other basis the block is exactly what the app extracted, because
 *  reproducing the app's own inputs is the entire point of the comparison. */
export function criteriaForCase(criteria: Criterion[], correction: ScreeningCorrection): string {
  const base = reconstructEligibilityCriteria(criteria);
  if (correction.basis !== "criterion-missing" || !correction.trueFailure) return base;
  const line = `- ${correction.trueFailure.requirement}`;
  if (base.includes(line)) return base;
  // Appended as an exclusion and labelled: a reader of this file must be able
  // to see which line came from the registry's own text via the ledger and
  // which one a clinician put back by hand.
  return `${base}\n\nExclusion Criteria (restored by clinician review — published in the study text but absent from this patient's ledger):\n${line}`;
}

export function reconstructTrial(trial: ScreenTrialSummary, criteria: Criterion[], correction?: ScreeningCorrection): Trial {
  return {
    nctId: trial.nctId,
    title: trial.title,
    phase: trial.phase,
    sponsor: trial.sponsor,
    url: trial.url,
    overallStatus: trial.overallStatus,
    eligibilityCriteria: correction ? criteriaForCase(criteria, correction) : reconstructEligibilityCriteria(criteria),
    ...UNKNOWN_TRIAL_DEFAULTS,
  };
}

/** What a reviewer must be told before trusting `trial` in an exported case.
 *  Shipped INSIDE every AdjudicatedCase (see `reconstructionCaveats`) rather
 *  than left as a comment only developers read. */
export const RECONSTRUCTION_CAVEATS: string[] = [
  "trial.eligibilityCriteria below is RECONSTRUCTED from this patient's own criterion ledger (the requirement text /api/screen already extracted for them), not copied verbatim from the ClinicalTrials.gov record. The /screen page's client state never holds the trial's raw eligibility prose — only a small summary (lib/screenTypes.ts: ScreenTrialSummary) — so the registry's exact wording, and any criterion the model did not surface into THIS patient's ledger, are not present here.",
  "conditions, sex, minimumAge, maximumAge, stdAges, locations, contacts, startDate, primaryCompletionDate, completionDate, lastUpdatePostDate, randomized, masked, primaryPurpose, interventional, enrollment, interventions, studyType, and officialTitle are unknown to /screen's client state and are filled with neutral placeholder defaults below, not sourced from the registry.",
  "This reconstruction is enough to make the case RUNNABLE — evals/ledger.ts's reasonTrial() only needs a criteria string to reason over — but not enough to guarantee it reproduces the registry's exact prompt. For full fidelity, replace `trial` with the output of getTrial(nctId) (lib/ctgov.ts) before treating this case as authoritative.",
];

/* ---- the exported artifact -------------------------------------------- */

/** Embedded in every exported file as `notice`, so the warning travels WITH
 *  the data rather than living only on the page that produced it — the same
 *  discipline lib/cohortCsv.ts and buildScreeningLog (app/page.tsx) already
 *  hold their own exports to. This is a health-data artifact: a patient
 *  summary and a clinical outcome, meant to be committed to a repo. */
export const HEALTH_DATA_NOTICE =
  "HEALTH-DATA ARTIFACT. This file carries one patient's clinical summary, this trial's identity, " +
  "and a clinician's adjudicated screening outcome for them. Trialign keeps no copy — once this file " +
  "leaves the browser tab, this download is the only copy that exists. Before this file is committed, " +
  "forwarded, or stored anywhere, treat it exactly as you would any other document containing PHI: " +
  "confirm the summary is de-identified or synthetic before it leaves your hands, and follow your " +
  "institution's policy for research data. This app's own rule is that no real patient information is " +
  "ever entered — if that rule was followed, this file is synthetic; if it wasn't, this file is the " +
  "exposure.";

/** One clinician correction, packaged with everything evals/ledger.ts needs
 *  to re-run this patient against this trial from scratch — the shape that
 *  can be pasted into evals/cases/ (or dropped as JSON into
 *  evals/cases/adjudicated/, see evals/cases/adjudicated-loader.ts) and
 *  actually executed, not just displayed. */
export type AdjudicatedCase = {
  kind: "trialign-adjudicated-case";
  schemaVersion: 1;
  exportedAt: string;
  notice: string;
  id: string;
  about: string;
  profile: { summary: string; fields: { label: string; value: string }[] };
  trial: Trial;
  /** The clinician's claim — see ScreeningCorrection.trueStatus. This, not
   *  anything the app derived, is what the eval harness treats as gold. */
  expected: CorrectedStatus;
  /** Present only when the correction names a failing criterion — lets the
   *  eval harness pin the exact criterion the way authored cases already do
   *  (see LedgerCase.mustFail in evals/cases/ledger-cases.ts). */
  mustFail?: string[];
  /** Whether this case may enter the gold set. False for an "outside-the-record"
   *  correction: the deciding fact was never in the profile the model reasons
   *  over, so scoring it would mark correct reasoning as a miss and corrupt the
   *  false-eligible rate. The case is still exported and still loaded — it is
   *  reported, not discarded, because a screening failure the app could not
   *  have caught is a fact about the record, and losing it silently is how the
   *  suite would come to look better than it is. */
  evalUsable: boolean;
  /** Why, in the reviewer's terms, when evalUsable is false. */
  evalUsableReason: string;
  correction: ScreeningCorrection;
  reconstructionCaveats: string[];
};

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "patient";
}

function describeCorrection(c: ScreeningCorrection): string {
  const verb = c.confirmsApp ? "confirms" : "corrects";
  const base = `Clinician ${verb} the app's screen of ${c.patientId} against ${c.trialNctId}: app derived "${c.appStatus}", reviewer says "${c.trueStatus}".`;
  return c.trueFailure ? `${base} True failure: ${c.trueFailure.requirement}.` : base;
}

/** Build the full exportable artifact from one coordinator correction plus
 *  the patient row and trial summary /screen already has in memory. Pure —
 *  no I/O. The caller (app/screen/page.tsx) turns the return value into a
 *  file download; nothing here writes anything. */
export function buildAdjudicatedCase(input: {
  correction: ScreeningCorrection;
  patient: Pick<PatientResult, "criteria">;
  profile: { summary: string; fields?: { label: string; value: string }[] };
  trial: ScreenTrialSummary;
  now?: Date | number;
}): AdjudicatedCase {
  const now = input.now ?? Date.now();
  const c = input.correction;
  const trial = reconstructTrial(input.trial, input.patient.criteria, c);
  const dateStamp = new Date(now).toISOString().slice(0, 10);
  const mustFail = c.trueFailure ? [c.trueFailure.requirement] : undefined;
  const evalUsable = goldable(c);

  // The guarantee that makes an unsatisfiable case impossible to emit rather
  // than merely unlikely: if this case is going into the gold set and pins a
  // criterion, that criterion must be present in the text the model will be
  // shown. Throwing here is right — a silently-red gold case is worse than no
  // case, because it reads as a model defect forever.
  if (evalUsable && mustFail) {
    for (const req of mustFail) {
      if (!trial.eligibilityCriteria.includes(req)) {
        throw new Error(
          `Refusing to export a gold case that cannot be satisfied: it requires a failure on ${JSON.stringify(req)}, ` +
            "which does not appear in the eligibility text the case carries. If the criterion is published but the app " +
            'never surfaced it, the basis is "criterion-missing"; if it was never in the record, it is "outside-the-record".',
        );
      }
    }
  }

  return {
    kind: "trialign-adjudicated-case",
    schemaVersion: 1,
    exportedAt: new Date(now).toISOString(),
    notice: HEALTH_DATA_NOTICE,
    id: `adjudicated-${input.trial.nctId}-${slug(input.correction.patientId)}-${dateStamp}`,
    about: describeCorrection(input.correction),
    profile: { summary: input.profile.summary, fields: input.profile.fields ?? [] },
    trial,
    expected: c.trueStatus,
    mustFail,
    evalUsable,
    evalUsableReason: evalUsable
      ? ""
      : "The deciding fact was not in the record screened, so a model reasoning over this profile should reach the app's " +
        "answer. Kept as feedback about the record; excluded from the gold set so it cannot mark correct reasoning as a miss.",
    correction: c,
    reconstructionCaveats: RECONSTRUCTION_CAVEATS,
  };
}

/** Pretty-printed, stable key order (object literals above are already
 *  written in the order they should read) — a coordinator or a reviewer may
 *  open this file directly, not just feed it to a loader. */
export function serializeAdjudicatedCase(ac: AdjudicatedCase): string {
  return JSON.stringify(ac, null, 2) + "\n";
}

/* ---- reading an exported case back -------------------------------------- */

/** Mirrors the DisclosureOutcome pattern in lib/disclosure.ts: the
 *  discriminant is `ok`, never the absence of a thrown error, so a caller
 *  cannot mistake "parsing failed" for "here is a degenerate case". */
export type ParsedAdjudicatedCase = { ok: true; case: AdjudicatedCase } | { ok: false; error: string };

const MATCH_STATUSES: MatchStatus[] = ["eligible", "near", "uncertain", "screened", "excluded"];
const CORRECTED_STATUSES: CorrectedStatus[] = ["eligible", "uncertain", "near"];

function fail(error: string): ParsedAdjudicatedCase {
  return { ok: false, error };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Structurally validate a parsed JSON value as an AdjudicatedCase. Checked
 *  by hand rather than with a schema library — this file adds zero new
 *  dependencies, per the roadmap's own constraint — but every field
 *  toLedgerCase() and evals/ledger.ts actually read is checked for presence
 *  and shape, and the two invariants (near ⇒ trueFailure; confirmsApp must
 *  agree with appStatus/trueStatus) are re-checked here too, so a hand-edited
 *  or truncated file is rejected instead of silently producing a case that
 *  LOOKS runnable and isn't. */
export function validateAdjudicatedCase(data: unknown): ParsedAdjudicatedCase {
  if (!isRecord(data)) return fail("Expected a JSON object at the top level.");
  if (data.kind !== "trialign-adjudicated-case") {
    return fail(`Expected "kind": "trialign-adjudicated-case", got ${JSON.stringify(data.kind)}.`);
  }
  if (data.schemaVersion !== 1) return fail(`Unsupported schemaVersion ${JSON.stringify(data.schemaVersion)} (expected 1).`);
  if (!isNonEmptyString(data.id)) return fail("Missing or empty \"id\".");
  if (!isNonEmptyString(data.about)) return fail("Missing or empty \"about\".");
  if (!isNonEmptyString(data.notice)) return fail("Missing or empty \"notice\" — every export must carry the health-data warning.");
  if (!isNonEmptyString(data.exportedAt)) return fail("Missing or empty \"exportedAt\".");

  const profile = data.profile;
  if (!isRecord(profile) || typeof profile.summary !== "string" || !Array.isArray(profile.fields)) {
    return fail('"profile" must be an object with a string "summary" and an array "fields".');
  }

  const trial = data.trial;
  if (!isRecord(trial)) return fail('"trial" must be an object.');
  if (!isNonEmptyString(trial.nctId)) return fail('"trial.nctId" is missing or empty.');
  if (!isNonEmptyString(trial.title)) return fail('"trial.title" is missing or empty.');
  if (typeof trial.eligibilityCriteria !== "string" || !trial.eligibilityCriteria.trim()) {
    return fail('"trial.eligibilityCriteria" is missing or empty — a case with no criteria text cannot be reasoned over.');
  }

  if (!CORRECTED_STATUSES.includes(data.expected as CorrectedStatus)) {
    return fail(`"expected" must be one of ${CORRECTED_STATUSES.join(", ")}, got ${JSON.stringify(data.expected)}.`);
  }

  if (data.mustFail !== undefined && !(Array.isArray(data.mustFail) && data.mustFail.every((x) => typeof x === "string"))) {
    return fail('"mustFail", if present, must be an array of strings.');
  }

  const correction = data.correction;
  if (!isRecord(correction)) return fail('"correction" must be an object.');
  if (correction.kind !== "trialign-screening-correction") {
    return fail(`"correction.kind" must be "trialign-screening-correction", got ${JSON.stringify(correction.kind)}.`);
  }
  if (!isNonEmptyString(correction.patientId)) return fail('"correction.patientId" is missing or empty.');
  if (!isNonEmptyString(correction.trialNctId)) return fail('"correction.trialNctId" is missing or empty.');
  if (!MATCH_STATUSES.includes(correction.appStatus as MatchStatus)) {
    return fail(`"correction.appStatus" must be one of ${MATCH_STATUSES.join(", ")}, got ${JSON.stringify(correction.appStatus)}.`);
  }
  if (!CORRECTED_STATUSES.includes(correction.trueStatus as CorrectedStatus)) {
    return fail(`"correction.trueStatus" must be one of ${CORRECTED_STATUSES.join(", ")}, got ${JSON.stringify(correction.trueStatus)}.`);
  }
  if (typeof correction.confirmsApp !== "boolean") return fail('"correction.confirmsApp" must be a boolean.');
  // The invariant buildCorrection enforces at construction time, re-checked
  // here so a hand-edited file can't smuggle a spoofed confirmsApp through.
  const wantConfirms = correction.appStatus === correction.trueStatus;
  if (correction.confirmsApp !== wantConfirms) {
    return fail(
      `"correction.confirmsApp" (${correction.confirmsApp}) disagrees with appStatus/trueStatus ` +
        `(${JSON.stringify(correction.appStatus)} vs ${JSON.stringify(correction.trueStatus)}) — the app's status must never be able to ` +
        "silently overwrite, or be silently overwritten by, the clinician's claim.",
    );
  }

  const trueFailure = correction.trueFailure;
  if (trueFailure !== null) {
    if (!isRecord(trueFailure) || !isNonEmptyString(trueFailure.requirement) || typeof trueFailure.appNamedIt !== "boolean") {
      return fail('"correction.trueFailure" must be null, or an object with a non-empty "requirement" string and a boolean "appNamedIt".');
    }
  }
  if (correction.trueStatus === "near" && trueFailure === null) {
    return fail('A "near" correction must carry "correction.trueFailure" — the criterion the patient actually failed on.');
  }
  if (correction.trueStatus !== "near" && trueFailure !== null) {
    return fail('"correction.trueFailure" must be null unless "correction.trueStatus" is "near".');
  }
  if (correction.basis !== null && !CORRECTION_BASES.includes(correction.basis as CorrectionBasis)) {
    return fail(`"correction.basis" must be null or one of ${CORRECTION_BASES.join(", ")}, got ${JSON.stringify(correction.basis)}.`);
  }
  if (!wantConfirms && correction.basis === null) {
    return fail('A correction that disagrees with the app must carry a "correction.basis" — see CorrectionBasis.');
  }
  // Re-derived on read for the same reason confirmsApp is: a hand-edited file
  // must not be able to promote an outside-the-record correction into the gold
  // set, where it would score correct reasoning as a miss.
  const wantUsable = goldable({ confirmsApp: wantConfirms, basis: correction.basis as CorrectionBasis | null });
  if (typeof data.evalUsable !== "boolean") return fail('"evalUsable" must be a boolean.');
  if (data.evalUsable !== wantUsable) {
    return fail(
      `"evalUsable" (${data.evalUsable}) disagrees with the correction's basis (${JSON.stringify(correction.basis)}) — ` +
        "whether a case may enter the gold set is derived from why the screen diverged, never asserted by the file.",
    );
  }
  // A gold case pinning a criterion the model is never shown is unsatisfiable;
  // buildAdjudicatedCase refuses to emit one, and a file that arrived by
  // another route is rejected here rather than sitting red forever.
  if (wantUsable && Array.isArray(data.mustFail)) {
    for (const req of data.mustFail as string[]) {
      if (!(trial.eligibilityCriteria as string).includes(req)) {
        return fail(
          `"mustFail" requires a failure on ${JSON.stringify(req)}, which does not appear in "trial.eligibilityCriteria" — ` +
            "this case could never pass, whatever the model does.",
        );
      }
    }
  }
  if (typeof correction.note !== "string") return fail('"correction.note" must be a string.');
  if (!isNonEmptyString(correction.reviewedAt)) return fail('"correction.reviewedAt" is missing or empty.');
  if (typeof correction.reviewerLabel !== "string") return fail('"correction.reviewerLabel" must be a string.');

  if (!Array.isArray(data.reconstructionCaveats) || !data.reconstructionCaveats.every((x) => typeof x === "string")) {
    return fail('"reconstructionCaveats" must be an array of strings.');
  }

  return { ok: true, case: data as unknown as AdjudicatedCase };
}

/** Parse raw JSON text as an AdjudicatedCase. Malformed JSON and a
 *  well-formed-but-wrong-shaped object are both rejected with a stated
 *  reason — never coerced into a degenerate case that would silently run
 *  with, say, an empty criteria string or a spoofed confirmation. */
export function parseAdjudicatedCase(raw: string): ParsedAdjudicatedCase {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return fail(`Malformed JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  return validateAdjudicatedCase(data);
}

/** The shape evals/cases/ledger-cases.ts's LedgerCase expects, plus two
 *  fields every authored case leaves undefined — `adjudicated` and
 *  `correction` — so the harness can visibly tell a clinician-adjudicated
 *  case apart from an authored one (see evals/cases/adjudicated-loader.ts
 *  and its use in evals/ledger.ts). Structural, not imported from
 *  evals/cases/ledger-cases.ts: this module is app code and must not depend
 *  on the eval suite's own types. */
export type AdjudicatedLedgerCase = {
  id: string;
  about: string;
  profile: { summary: string; fields: { label: string; value: string }[] };
  trial: Trial;
  expected: CorrectedStatus;
  mustFail?: string[];
  adjudicated: true;
  correction: ScreeningCorrection;
};

/** Strip an AdjudicatedCase down to the fields the eval harness reads. Pure
 *  reshaping — no validation here; call parseAdjudicatedCase/
 *  validateAdjudicatedCase first. */
export function toLedgerCase(ac: AdjudicatedCase): AdjudicatedLedgerCase {
  return {
    id: ac.id,
    about: ac.about,
    profile: ac.profile,
    trial: ac.trial,
    expected: ac.expected,
    mustFail: ac.mustFail,
    adjudicated: true,
    correction: ac.correction,
  };
}
