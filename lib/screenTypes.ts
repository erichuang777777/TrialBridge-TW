/* ============================================================================
   Trialign — the /api/screen wire contract (§C1)

   This file IS the contract, not a copy of it. A Next route module may only
   *export* handlers and route config — but it may import anything, so
   app/api/screen/route.ts imports these types and MAX_COHORT from here rather
   than declaring its own. That direction matters: the route, the cohort screen,
   the CSV builder and the sample fixture then share one definition that the
   compiler checks, instead of parallel copies with a comment asking someone to
   keep them in sync. A cap written down twice is a cap that will disagree with
   itself the first time it changes.
   ========================================================================== */

import type { Criterion, MatchStatus } from "@/lib/types";

/** One entrant's worth of profile. A patient with neither a summary nor fields
 *  is rejected by the route before any reasoning runs (nothing to judge), so
 *  the UI validates the same way. */
export type PatientInput = {
  id: string;
  summary?: string;
  fields?: { label: string; value: string }[];
};

/** One row of the cohort matrix. No per-patient TrialMatch/Trial: the trial is
 *  identical for every row, so it travels once at the top level (see
 *  ScreenResponse). */
export type PatientResult = {
  id: string;
  status: MatchStatus;
  headline: string;
  criteria: Criterion[];
  metCount: number;
  total: number;
  openCount: number;
  hardFailCount: number;
  /** The plain-language reason a deterministic structural gate (age band, sex)
   *  ruled this patient out before any model call. null for every other status. */
  structuralExclusion: string | null;
};

/** The one trial every row is screened against — a small summary, not the full
 *  Trial shape, matching what the route actually returns (see its header
 *  comment: "the response carries it ONCE ... not once per patient"). */
export type ScreenTrialSummary = {
  nctId: string;
  title: string;
  phase: string;
  sponsor: string;
  url: string;
  overallStatus: string;
  registryAgeDays: number | null;
  registryStale: boolean;
};

/** POST /api/screen's JSON response body. The route returns a value declared
 *  `satisfies ScreenResponse`, so adding, renaming or dropping a field there
 *  fails to compile here rather than silently reaching a client that still
 *  expects the old shape. */
export type ScreenResponse = {
  trial: ScreenTrialSummary;
  /** Every MatchStatus bucket, always summing to `total` — see cohortCounts()
   *  in lib/verdict.ts, which is what the route uses to build this. */
  counts: Record<MatchStatus, number> & { total: number };
  /** Already sorted by the route (compareCohortPatients) — the client must
   *  never re-sort or re-derive status from this. */
  patients: PatientResult[];
};

/** The request a client sends. */
export type ScreenRequest = {
  nctId: string;
  patients: PatientInput[];
  /** Voice only — same meaning as /api/match's `entrant`, but defaulting to
   *  "clinician" here rather than "patient". Verdicts never move. */
  entrant?: string;
};

/** The same request as the route first sees it: parsed JSON from an untrusted
 *  caller, before validation, so every field may be missing. Derived from
 *  ScreenRequest rather than written out again — the route validates its way
 *  from this to that, and the two can never describe different fields. */
export type ScreenBody = Partial<ScreenRequest>;

/** A coordinator's list for one day, not an unbounded batch job — capped so a
 *  single request can't turn into an unbounded number of Claude calls. The
 *  route rejects over-cap rather than silently screening only the first
 *  MAX_COHORT; the UI reads the same constant so it can say so before firing a
 *  request that would 400 anonymously. One constant, one place. */
export const MAX_COHORT = 25;
