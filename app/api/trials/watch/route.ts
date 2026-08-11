/* ============================================================================
   GET /api/trials/watch  —  weekly clinician trial digest

   Unlike POST /api/trials, this is a fixed, non-patient-specific query (a
   condition name, a day window) — no diagnosis or note in the request, so a
   GET with query params carries none of the PHI-in-logs concern that route
   deliberately avoids. Backs both the /watch page and the weekly automation
   that reports this digest to the user.

   No `cond` param: returns one digest per TRACKED_CONDITIONS entry (the
   clinician tool's default view). With `cond`: returns just that one
   condition's digest, for a one-off check outside the tracked list.
   ========================================================================== */

import { NextResponse } from "next/server";
import { fetchWeeklyConditionDigest, fetchWeeklyDigests } from "@/lib/trialWatch";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const requestedDays = Number(searchParams.get("days"));
  const windowDays = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.min(requestedDays, 90) : 7;
  const condition = searchParams.get("cond")?.trim();

  try {
    if (condition) {
      const digest = await fetchWeeklyConditionDigest(windowDays, condition);
      return NextResponse.json(digest);
    }
    const digests = await fetchWeeklyDigests(windowDays);
    return NextResponse.json({ digests });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ClinicalTrials.gov request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
