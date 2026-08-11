/* ============================================================================
   Clinician trial watch — weekly "what changed" digest, per tracked cancer.

   Server-side only (built on lib/ctgov.ts). Answers a different question than
   the matching pipeline: not "which trials fit this patient" but "what did
   ClinicalTrials.gov touch this week" for a fixed list of cancer types a
   clinician tracks, grouped by each study's CURRENT overallStatus. No model
   call, no PHI, nothing patient-specific.

   Important limit: the v2 API gives a current status and a last-update date,
   not a status-change history, so a bucket here means "currently in status X,
   record touched this week" — not "transitioned to X this week". A study
   that's been recruiting for a year and just had its contact info corrected
   lands in `recruiting` exactly like one that opened days ago. Don't let
   downstream copy imply a transition this code can't actually see.
   ========================================================================== */

import type { Trial } from "./types";
import { searchRecentlyUpdatedTrials } from "./ctgov";

/** The clinician tool's fixed watch list — no free-text input yet, so this is
 *  the single place to add or drop a tracked cancer type. */
export const TRACKED_CONDITIONS = ["breast cancer", "lung cancer", "colorectal cancer"] as const;

export type WeeklyDigest = {
  generatedAt: string;
  windowDays: number;
  /** Inclusive lower bound sent to the registry, "YYYY-MM-DD". */
  sinceDate: string;
  condition: string;
  totalUpdated: number;
  /* The registry's `overallStatus` + `lastUpdatePostDate` say a record was
     touched this week and what it currently reads — NOT that the status
     itself changed this week. A long-recruiting study whose contact info was
     edited lands in `recruiting` here just as much as one that opened days
     ago; the v2 API this pulls from doesn't expose transition history, only
     current state. Buckets below are "currently in status X, touched this
     week", not "transitioned to X this week" — keep that framing in any UI
     built on this (see codex review on PR #3, lib/trialWatch.ts). */
  /** Currently RECRUITING, most-recently-updated first. */
  recruiting: Trial[];
  /** Currently TERMINATED, WITHDRAWN, or SUSPENDED — stopped before their
   *  planned end. `whyStopped` (when the sponsor filed one) is the reason. */
  closedEarly: Trial[];
  /** Currently COMPLETED — ran to its planned end. */
  completed: Trial[];
  /** Everything else the registry touched this week (e.g.
   *  ACTIVE_NOT_RECRUITING, ENROLLING_BY_INVITATION, NOT_YET_RECRUITING). */
  other: Trial[];
};

/** Statuses meaning a study stopped before its planned end, per the CT.gov
 *  v2 overallStatus enum. */
const CLOSED_EARLY_STATUSES = new Set(["TERMINATED", "WITHDRAWN", "SUSPENDED"]);

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Fetch and bucket every study for one condition that ClinicalTrials.gov
 *  updated in the last `windowDays` days. */
export async function fetchWeeklyConditionDigest(windowDays: number, condition: string): Promise<WeeklyDigest> {
  const sinceDate = isoDateDaysAgo(windowDays);
  const trials = await searchRecentlyUpdatedTrials({ cond: condition, sinceDate, pageSize: 100 });

  const recruiting: Trial[] = [];
  const closedEarly: Trial[] = [];
  const completed: Trial[] = [];
  const other: Trial[] = [];

  for (const t of trials) {
    const status = t.overallStatus.toUpperCase();
    if (status === "RECRUITING") recruiting.push(t);
    else if (CLOSED_EARLY_STATUSES.has(status)) closedEarly.push(t);
    else if (status === "COMPLETED") completed.push(t);
    else other.push(t);
  }

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    sinceDate,
    condition,
    totalUpdated: trials.length,
    recruiting,
    closedEarly,
    completed,
    other,
  };
}

/** One digest per tracked cancer type — the clinician tool's weekly report.
 *  Runs the condition fetches concurrently since they're independent registry
 *  calls. Defaults to TRACKED_CONDITIONS; pass a subset to scope a run. */
export async function fetchWeeklyDigests(
  windowDays = 7,
  conditions: readonly string[] = TRACKED_CONDITIONS,
): Promise<WeeklyDigest[]> {
  return Promise.all(conditions.map((condition) => fetchWeeklyConditionDigest(windowDays, condition)));
}
