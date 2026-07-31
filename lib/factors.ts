/* ============================================================================
   Trialign — deterministic decision factors

   Everything here is computed in code from registry data: no model output feeds
   any of it. That is the point. The preference re-ranking on the results screen
   and the at-a-glance factor row both have to be explainable to a patient
   ("moved up: open-label, no randomization"), which they cannot be if the
   underlying numbers came out of a model.

   These live in lib/ rather than inside the route because a Next.js route file
   may only export its handlers — and because the eval harness drives them
   directly, without HTTP.
   ========================================================================== */

import { siteIsRecruiting } from "./ctgov.ts";
import { proximity, siteLabel, type PatientLoc } from "./geo.ts";
import type { Trial, DecisionFactors } from "./types";

/** A registry record untouched for longer than this is flagged stale: a study
 *  can sit at RECRUITING long after it stopped enrolling, and record freshness
 *  is the only published signal a patient has about that. */
export const STALE_AFTER_DAYS = 180;

/** Everything the deterministic geo/proximity/freshness layer needs for one search. */
export type GeoContext = {
  patient: PatientLoc;
  /** Min proximityScore to count as "within range" (see lib/geo). 0 = no filter. */
  travelThr: number;
  /** Request-time clock, taken once so every card in one response ages against
   *  the same instant. */
  now: number;
};

export function phaseToRank(phase: string): number {
  const p = phase.toLowerCase();
  if (p.includes("4")) return 4;
  if (p.includes("3")) return 3;
  if (p.includes("2")) return 2;
  if (p.includes("1")) return 1;
  return 0; // N/A or observational
}

/** Rough burden estimate: observational = low; early-phase interventional = higher. */
export function burdenProxy(trial: Trial): number {
  if (!trial.interventional) return 0;
  return phaseToRank(trial.phase) <= 1 ? 2 : 1;
}

export function computeFactors(trial: Trial, geo: GeoContext): DecisionFactors {
  const { patient, travelThr } = geo;

  // A study can be RECRUITING while individual sites are withdrawn, suspended or
  // complete. Proximity is computed over the OPEN sites only — naming a closed
  // site as "your nearest" sends a patient to a door that is shut. When no site
  // is open we still name one, and nearestSiteActive says so.
  const openSites = trial.locations.filter(siteIsRecruiting);
  const placeable = openSites.length > 0 ? openSites : trial.locations;

  let best = 0;
  let nearest = "";
  for (const loc of placeable) {
    const score = proximity(loc, patient);
    if (score > best) {
      best = score;
      nearest = siteLabel(loc);
    }
  }
  const hasPlaceableSite = trial.locations.some((l) => l.city || l.state || l.country);
  if (!nearest) nearest = placeable[0] ? siteLabel(placeable[0]) : "No site listed";

  // withinRange is only a real yes/no when we ran distance filtering (patient
  // location known + a distance preference set). Otherwise it's null = "not filtered".
  const filtering = patient.known && travelThr > 0;
  const withinRange = filtering ? best >= travelThr : null;

  const registryAgeDays = ageInDays(trial.lastUpdatePostDate, geo.now);

  return {
    phaseRank: phaseToRank(trial.phase),
    randomized: trial.randomized || trial.masked,
    interventional: trial.interventional,
    nearestSite: nearest,
    nearestSiteActive: openSites.length > 0,
    proximityScore: best,
    burdenProxy: burdenProxy(trial),
    withinRange,
    locationUnknown: !hasPlaceableSite,
    enrollmentWindow: enrollmentWindow(trial),
    registryAgeDays,
    registryStale: registryAgeDays !== null && registryAgeDays > STALE_AFTER_DAYS,
  };
}

/** Whole days between a registry date ("YYYY-MM-DD" or "YYYY-MM") and now.
 *  null when the date is missing or unparseable — never guessed at. */
export function ageInDays(date: string, now: number): number | null {
  const raw = (date ?? "").trim();
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(raw);
  if (!m) return null;
  const parsed = Date.UTC(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1);
  if (!Number.isFinite(parsed)) return null;
  const days = Math.floor((now - parsed) / 86_400_000);
  return days >= 0 ? days : 0;
}

/* ---- enrollment window (P1.1) — best-estimate, explicitly labeled ----
   CT.gov has no clean "enrollment close" field. For a recruiting study we know
   enrollment is open now; the primary completion date is the closest published
   upper bound on how long there is to get in. We surface it AS an estimate. */
export function enrollmentWindow(trial: Trial): string {
  const recruiting = trial.overallStatus.toUpperCase() === "RECRUITING";
  const bound = trial.primaryCompletionDate || trial.completionDate;
  const boundLabel = fmtMonthYear(bound);
  if (recruiting && boundLabel) return `Open now · est. closes before ~${boundLabel}`;
  if (recruiting) return "Open now · estimated close date not published";
  if (boundLabel) return `Est. closes before ~${boundLabel}`;
  return "";
}

/** "2026-03-31" or "2026-03" → "Mar 2026". Returns "" for empty/malformed input. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtMonthYear(date: string): string {
  const m = /^(\d{4})-(\d{2})/.exec((date ?? "").trim());
  if (!m) return "";
  const year = m[1];
  const monthIdx = Number(m[2]) - 1;
  return monthIdx >= 0 && monthIdx < 12 ? `${MONTHS[monthIdx]} ${year}` : year;
}
