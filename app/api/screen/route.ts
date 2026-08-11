/* ============================================================================
   POST /api/screen  —  one trial → per-patient eligibility matrix

   The mirror image of /api/match. That route runs profile → ranked trials;
   this one runs the arrow the other direction — a coordinator has a study
   already open and a list of patients, and asks "who on today's list might
   fit?" Same engine (structural gate, then reasonTrial), different axis of
   iteration: here the trial is held fixed and N patient profiles pass through
   it, instead of one profile passing through N trials.

   Pipeline (mirrors /api/match's discipline):
   1. Validate the request — a well-formed NCT id, at least one patient, the
      cohort under MAX_COHORT, and every patient carrying enough profile to
      reason over. Reject rather than silently truncate or reason over nothing.
   2. getTrial(nctId) — 404 is a real, expected answer, not an error.
   3. Per patient, the deterministic structural gate (age band, sex) from
      lib/structuralGate.ts. A gated-out patient is reported WITH the reason
      and never consumes a model call — same invariant as /api/match's
      registry-level exclusions.
   4. Reason the rest with reasonTrial() — the same prompt /api/match and the
      eval harness use, not a copy — at bounded concurrency.
   5. Sort the way a coordinator triages: who's in, then fewest open items,
      then fewest settled failures. compareCohortPatients (lib/verdict.ts)
      reuses openCountOf/hardFailCountOf — never a met/total ratio, for the
      same reason /api/match doesn't rank trials on one: the criteria are
      segmented by the model, so that denominator is an artifact of how
      finely one patient's ledger happened to split.

   There is no per-cohort location (a coordinator's list isn't "near" anywhere
   in particular), so geo/proximity is deliberately inert here: travelThr = 0
   and an unknown patient location mean computeFactors never filters on it.

   The trial is identical for every row, so the response carries it ONCE
   (counts + a small trial summary), not once per patient — returning the full
   TrialMatch N times would be pure waste. The criteria array per patient IS
   returned in full: it is the ledger, and the ledger is the evidence.
   ========================================================================== */

import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { getTrial, isValidNctId } from "@/lib/ctgov";
import { reasonSystem, reasonTrial, renderProfile } from "@/lib/reason";
import { derivePatientDemographics, structuralExclusion } from "@/lib/structuralGate";
import { computeFactors, type GeoContext } from "@/lib/factors";
import { derivePatientLoc } from "@/lib/geo";
import { openCountOf, hardFailCountOf, compareCohortPatients, cohortCounts } from "@/lib/verdict";
// The wire contract lives in lib/ and is imported here, not redeclared. A route
// module may only EXPORT handlers — importing is unrestricted — so there is no
// reason for the cohort screen and this route to hold separate copies of the
// same shapes, or two constants both spelling the cap.
import { MAX_COHORT, type PatientInput, type PatientResult, type ScreenBody, type ScreenResponse } from "@/lib/screenTypes";
import type { Criterion, MatchStatus, Trial } from "@/lib/types";

export const runtime = "nodejs";
// MAX_COHORT patients ÷ CONCURRENCY concurrent Claude calls = 5 sequential
// batches worst case. /api/match budgets 300s for 2 batches at the same
// concurrency (DEEP_REASON_COUNT=10 / CONCURRENCY=5) — this scales that
// per-batch budget to the higher batch count.
export const maxDuration = 600;

const CONCURRENCY = 5; // simultaneous per-patient Claude calls, same as /api/match

export async function POST(req: Request) {
  let body: ScreenBody;
  try {
    body = (await req.json()) as ScreenBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const nctId = (body.nctId ?? "").trim();
  if (!nctId) {
    return NextResponse.json({ error: "nctId is required." }, { status: 400 });
  }
  if (!isValidNctId(nctId)) {
    return NextResponse.json({ error: `Invalid NCT id: "${nctId}". Expected the form NCT followed by 8 digits.` }, { status: 400 });
  }

  const patients = body.patients ?? [];
  if (patients.length === 0) {
    return NextResponse.json({ error: "At least one patient is required." }, { status: 400 });
  }
  if (patients.length > MAX_COHORT) {
    return NextResponse.json(
      { error: `Cohort of ${patients.length} exceeds the ${MAX_COHORT}-patient cap. Split into smaller batches.` },
      { status: 400 },
    );
  }
  // A patient with no summary and no fields is an empty profile — there is
  // nothing to reason over, so reject up front rather than let the model
  // improvise a verdict from nothing.
  const empty = patients.filter((p) => !(p.summary ?? "").trim() && (p.fields ?? []).length === 0);
  if (empty.length > 0) {
    return NextResponse.json(
      { error: `Patient(s) with no summary and no fields: ${empty.map((p) => p.id).join(", ")}.` },
      { status: 400 },
    );
  }

  let trial: Trial | null;
  try {
    trial = await getTrial(nctId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trial registry request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  if (!trial) {
    return NextResponse.json({ error: `No study found for ${nctId}.` }, { status: 404 });
  }

  // No per-cohort location: a coordinator's list isn't "near" anywhere in
  // particular. travelThr: 0 plus an unknown patient location mean proximity
  // is computed (for registry-freshness factors below) but never filters.
  const now = Date.now();
  const geo: GeoContext = { patient: derivePatientLoc([], ""), travelThr: 0, now };
  // Unlike /api/match, which a patient can drive, this route only exists for
  // someone screening a list — so the addressee defaults to the clinician voice
  // rather than to "you". A caller can still override it; nothing but voice moves.
  const system = reasonSystem(body.entrant ?? "clinician");

  const excludedResults: PatientResult[] = [];
  const toReason: PatientInput[] = [];
  for (const patient of patients) {
    const demographics = derivePatientDemographics(patient.fields ?? [], patient.summary);
    const gate = structuralExclusion(trial, demographics);
    if (gate) {
      excludedResults.push({
        id: patient.id,
        status: "excluded",
        headline: gate.reason,
        criteria: [],
        metCount: 0,
        total: 0,
        openCount: 0,
        hardFailCount: 0,
        structuralExclusion: gate.reason,
      });
    } else {
      toReason.push(patient);
    }
  }

  let reasonedResults: PatientResult[];
  try {
    const client = anthropic();
    reasonedResults = await mapPool(toReason, CONCURRENCY, async (patient) => {
      const profileText = renderProfile(patient);
      const match = await reasonTrial(client, system, profileText, trial, geo);
      return {
        id: patient.id,
        status: match.status,
        headline: match.headline,
        criteria: match.criteria,
        metCount: match.metCount,
        total: match.total,
        openCount: openCountOf(match.criteria),
        hardFailCount: hardFailCountOf(match.criteria),
        structuralExclusion: null,
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reasoning failed.";
    const status = message.includes("ANTHROPIC_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  const results = [...reasonedResults, ...excludedResults];
  results.sort(compareCohortPatients);

  // Buckets that always sum to total — including "screened", which is reachable
  // here whenever a study publishes no eligibility text. See cohortCounts().
  const counts = cohortCounts(results);

  const factors = computeFactors(trial, geo);
  // `satisfies` rather than a cast: this is the one place the wire shape is
  // produced, so a field added or renamed here must fail to compile against the
  // contract the client reads, not reach it as a surprise at runtime.
  return NextResponse.json({
    trial: {
      nctId: trial.nctId,
      title: trial.title,
      phase: trial.phase,
      sponsor: trial.sponsor,
      url: trial.url,
      overallStatus: trial.overallStatus,
      registryAgeDays: factors.registryAgeDays,
      registryStale: factors.registryStale,
    },
    counts,
    patients: results,
  } satisfies ScreenResponse);
}

/** Run fn over items with at most `limit` in flight; preserves input order.
 *  Copied from app/api/match/route.ts rather than shared — it's a generic
 *  concurrency primitive, not part of the trust surface those two routes must
 *  keep identical. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}
