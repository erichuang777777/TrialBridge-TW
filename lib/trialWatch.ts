/* ============================================================================
   Breast cancer trial watch — weekly "what changed" digest.

   Server-side only (built on lib/ctgov.ts). Answers a different question than
   the matching pipeline: not "which trials fit this patient" but "what moved
   on ClinicalTrials.gov this week" for breast cancer generally — new studies
   that opened to enrollment, studies that closed early or were withdrawn, and
   studies that completed. Grouped by the registry's own overallStatus; no
   model call, no PHI, nothing patient-specific.
   ========================================================================== */

import type { Trial } from "./types";
import { searchRecentlyUpdatedTrials } from "./ctgov";

export type WeeklyDigest = {
  generatedAt: string;
  windowDays: number;
  /** Inclusive lower bound sent to the registry, "YYYY-MM-DD". */
  sinceDate: string;
  condition: string;
  totalUpdated: number;
  /** Newly/still RECRUITING, most-recently-updated first. */
  recruiting: Trial[];
  /** TERMINATED, WITHDRAWN, or SUSPENDED — closed before their planned end.
   *  `whyStopped` (when the sponsor filed one) is the reason. */
  closedEarly: Trial[];
  /** COMPLETED — ran to its planned end. */
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

/** Fetch and bucket every breast-cancer study ClinicalTrials.gov updated in
 *  the last `windowDays` days. Default condition is "breast cancer"; callers
 *  needing a narrower slice (e.g. "HER2-low breast cancer") can override it. */
export async function fetchWeeklyBreastCancerDigest(
  windowDays = 7,
  condition = "breast cancer",
): Promise<WeeklyDigest> {
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
