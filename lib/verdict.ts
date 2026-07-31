/* ============================================================================
   Trialign — the verdict meaning system (single source of truth)

   The verdict triad (meets/clear/confirm/fails) and the fail-closed derivation
   of a trial's overall status are the product's trust surface. They must read
   identically everywhere they are applied:
     - /api/match      : first-pass reasoning over each trial
     - /api/reconfirm  : re-judging a criterion after the patient adds info
     - the client      : recomputing a card's status when a "confirm" resolves

   So the rules text and the derivation live here, imported by all three, rather
   than being re-stated (and allowed to drift) in each place.
   ========================================================================== */

import type { Criterion, MatchStatus } from "@/lib/types";

/** The verdict rules — the exact meaning of each verdict. Shared by every
 *  prompt that judges a criterion so the meaning system never forks. */
export const VERDICT_RULES = `Verdict rules (this is the product's meaning system — be exact):
- meets  : an INCLUSION criterion the patient satisfies. Cite the evidence.
- clear  : an EXCLUSION criterion that is NOT triggered (good for the patient).
- confirm: the record genuinely lacks the data to judge this criterion. Say so — never guess it into a pass or a fail. This becomes a coordinator to-do (e.g. "confirm RECIST measurability", "confirm HbA1c").
- fails  : an INCLUSION criterion the patient does not meet, OR an EXCLUSION criterion that IS triggered.

For EVERY criterion also set \`remediable\` — whether this patient could come to satisfy it. It is only consulted when the verdict is "fails"; set it honestly regardless (use false for anything that is already satisfied and fixed):
- true  : a washout that will elapse, a scan or lab that can be ordered or redrawn, a consent or device that can be obtained, a value that fluctuates and may re-qualify. These are the near-misses a coordinator can actually work.
- false : fixed for this patient — sex, age band, tumor type or subtype, an irreversible prior therapy or surgery, a permanent comorbidity, a prior-lines cap already exceeded.
Judge the CRITERION, not your optimism. If becoming eligible would require the disease itself to change, it is false.

Hard requirements:
- Fail closed. If the patient is a near-miss, list EVERY failing criterion, not just the first. A false "so close" is worse than a clean no.
- Cite the record in the coordinator's words in the evidence field. Be concrete.
- Do not invent patient data. If the profile is silent on something a criterion needs, that criterion is "confirm", not a pass.
- Keep requirements atomic and in plain clinical language.`;

/** A criterion counts toward "met" when an inclusion is satisfied or an
 *  exclusion is not triggered. */
export function metCountOf(criteria: Criterion[]): number {
  return criteria.filter((c) => c.verdict === "meets" || c.verdict === "clear").length;
}

/** Open "confirm" items — the coordinator's to-do count for this trial. */
export function openCountOf(criteria: Criterion[]): number {
  return criteria.filter((c) => c.verdict === "confirm").length;
}

/** Failing criteria the patient could still come to satisfy (elapsed washout,
 *  a scan that gets ordered). The workable near-misses. */
export function remediableFailCountOf(criteria: Criterion[]): number {
  return criteria.filter((c) => c.verdict === "fails" && c.remediable).length;
}

/** Failing criteria that are fixed for this patient — sex, age band, tumor type,
 *  an irreversible prior therapy. One of these means "no", not "not yet". */
export function hardFailCountOf(criteria: Criterion[]): number {
  return criteria.filter((c) => c.verdict === "fails" && !c.remediable).length;
}

/** Derive a trial's overall standing from its criteria — fail-closed and
 *  explainable, never a model's self-report. Any fail → ruled out (near);
 *  else any open confirm → uncertain; else eligible. No criteria → screened. */
export function deriveStatus(criteria: Criterion[]): MatchStatus {
  if (criteria.length === 0) return "screened";
  const hasFail = criteria.some((c) => c.verdict === "fails");
  const hasConfirm = criteria.some((c) => c.verdict === "confirm");
  return hasFail ? "near" : hasConfirm ? "uncertain" : "eligible";
}

/* ---- ranking ---------------------------------------------------------------
   The old ordering was `metCount / total`. That ratio is not comparable across
   trials: the criteria are segmented by the model, so one study yields 8 atomic
   requirements and another yields 25 from prose of the same substance. A study
   that happened to be split finely ranked below one split coarsely, purely as an
   artifact of segmentation — a scoring bug wearing the costume of a score.

   The replacement sorts on quantities that mean the same thing everywhere:

     1. status         — eligible, then uncertain, then near, then the rest.
     2. hard failures  — within "near", definitively-out sinks below workable.
     3. open items     — the coordinator's actual workload, an absolute count.
     4. remediable     — fewer things to chase first.
     5. stale record   — a registry entry untouched for months ranks last.

   Every term is either a code-derived count or a registry date. None of it is a
   model's self-reported confidence.
   -------------------------------------------------------------------------- */

export const STATUS_RANK: Record<MatchStatus, number> = {
  eligible: 0,
  uncertain: 1,
  near: 2,
  screened: 3,
  excluded: 4,
};

export type RankableMatch = {
  status: MatchStatus;
  criteria: Criterion[];
  factors: { registryStale: boolean };
};

/** Lexicographic sort key — compare element by element, first difference wins. */
export function rankKey(m: RankableMatch): number[] {
  return [
    STATUS_RANK[m.status],
    hardFailCountOf(m.criteria),
    openCountOf(m.criteria),
    remediableFailCountOf(m.criteria),
    m.factors.registryStale ? 1 : 0,
  ];
}

/** Comparator over rankKey(), for Array.prototype.sort. */
export function compareMatches(a: RankableMatch, b: RankableMatch): number {
  const ka = rankKey(a);
  const kb = rankKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return 0;
}

/* ---- cohort ranking (§C1) ---------------------------------------------------
   /api/screen holds the trial fixed and ranks PATIENTS against it — the mirror
   of compareMatches, which holds the patient fixed and ranks trials. Same
   discipline, same reason: absolute, code-derived counts only, never a
   met/total ratio (identical argument as above — a patient whose ledger
   happened to segment into more atomic criteria is not thereby a worse fit).

   Order is what a coordinator actually triages on: who's in, then who has the
   fewest open items to chase, then who has the fewest settled failures — a
   coordinator can still work a patient with one open "confirm" faster than one
   buried in hard fails, even though both are merely "uncertain"/"near". */

export type CohortRankable = {
  status: MatchStatus;
  criteria: Criterion[];
};

export function cohortRankKey(p: CohortRankable): number[] {
  return [STATUS_RANK[p.status], openCountOf(p.criteria), hardFailCountOf(p.criteria)];
}

/** Comparator over cohortRankKey(), for Array.prototype.sort. */
export function compareCohortPatients(a: CohortRankable, b: CohortRankable): number {
  const ka = cohortRankKey(a);
  const kb = cohortRankKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return 0;
}

/** Bucket a cohort by derived status. Every status a row can hold gets a bucket,
 *  so the buckets always sum to `total` — the same invariant the results screen
 *  holds itself to ("the header and the buckets can never disagree"). It lives
 *  here, and is tested, because a count that quietly stops reconciling is a bug
 *  that reads as a fact: a screen of 20 patients reporting four zeroes and no
 *  explanation looks like a finding rather than a dropped bucket. */
export function cohortCounts(rows: { status: MatchStatus }[]): Record<MatchStatus, number> & { total: number } {
  const counts = { eligible: 0, uncertain: 0, near: 0, screened: 0, excluded: 0 };
  for (const r of rows) counts[r.status]++;
  return { ...counts, total: rows.length };
}
