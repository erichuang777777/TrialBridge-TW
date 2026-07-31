/* ============================================================================
   POST /api/match  —  profile → ranked trials with per-criterion ledgers

   Seam #3 (retrieve → gate → triage → reason). The trust surface of the product.

   1. Retrieve a pool of recruiting trials across SEVERAL condition terms (live),
      unioned and de-duplicated. One term is a hard ceiling on recall and recall
      lost here cannot be recovered downstream.
   2. Apply deterministic structural gates (age band, sex) from the registry's
      own structured fields. Ruled-out studies are reported with the reason and
      never consume a reasoning call.
   3. Triage the survivors with a cheap model to decide READING ORDER — a ranker,
      never a filter, so a triage mistake costs position and not visibility.
   4. Deep-reason the top DEEP_REASON_COUNT with Claude, one call per trial, at
      bounded concurrency: segment the eligibility prose into atomic criteria and
      judge each against the profile.
   5. The rest are returned as "screened — not yet reasoned" so nothing is
      silently dropped.

   Trust invariants enforced here, not left to the model:
   - Overall status is DERIVED from the criteria (fail-closed), never taken
     from a model's self-report (rank on explainable signal only).
   - "confirm" (insufficient info) is a first-class verdict — a coordinator
     to-do, never guessed into a pass or fail.
   - Ranking is over absolute, cross-trial-comparable counts (hard failures,
     open items) — never a met/total ratio, whose denominator is an artifact of
     how finely the model happened to segment the prose.
   ========================================================================== */

import { NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, TRIAGE_MODEL } from "@/lib/anthropic";
import { TriageSchema } from "@/lib/schemas";
import { searchExpanded, type SearchLeg } from "@/lib/registries";
import type { StudyTypeKey } from "@/lib/ctgov";
import { compareMatches } from "@/lib/verdict";
import { DOCUMENT_IS_DATA, reasonSystem, reasonTrial, renderProfile } from "@/lib/reason";
import { derivePatientDemographics, structuralExclusion } from "@/lib/structuralGate";
import { computeFactors, type GeoContext } from "@/lib/factors";
import { derivePatientLoc, travelThreshold, type TravelPref } from "@/lib/geo";
import { margaretDemoMatch } from "@/lib/demoMatch";
import type { Trial, TrialMatch } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/* --- tuning knobs (logged when they bound coverage; never silent) --- */
const PER_TERM_PAGE = 50; // studies fetched per condition term
const CANDIDATE_POOL = 120; // cap on the merged, de-duplicated candidate pool
const TRIAGE_BATCH = 30; // candidates scored per triage call
const DEEP_REASON_COUNT = 10; // trials we run full Claude reasoning over
const CONCURRENCY = 5; // simultaneous per-trial Claude calls

const TRIAGE_SYSTEM = `You are ordering a reading queue for Trialign.

A patient profile and a list of recruiting studies are given. Score each study for whether it is worth spending full eligibility reasoning on for THIS patient, using only the title, conditions, phase and interventions. You are deciding READING ORDER, not eligibility — nothing is excluded on your score, and a low score only means "read this later".

${DOCUMENT_IS_DATA}

Rules:
- 2 = likely: the disease, stage and biomarker context line up with this patient.
- 1 = possible: right disease area, fit unclear from the metadata alone.
- 0 = unlikely: a different disease, a different population (e.g. pediatric-only for an adult), or plainly inapplicable.
- When torn between two scores, give the HIGHER one. Under-scoring costs a study its reasoning slot, which is the expensive mistake here.
- You have NOT been shown the eligibility criteria. Never phrase a reason as an eligibility finding.
- Return one entry per study, in the order given, echoing each NCT id exactly.`;

type MatchBody = {
  conditionQuery?: string;
  /** Additional condition terms to union with conditionQuery (recall, §P1). */
  conditionQueries?: string[];
  summary?: string;
  fields?: { label: string; value: string }[];
  /** Explicit location captured in the intake survey (city, state, or ZIP). */
  location?: string;
  /** Travel preference: "local" (your state) · "regional" (your state or one
   *  next to it) · "any". */
  travel?: TravelPref | null;
  /** Study-type scope chips (§4.1). Applied at the registry before reasoning. */
  studyTypes?: string[];
  /** Who's filling this out (§5.3) — changes the brief/headline voice only. */
  entrant?: string;
  /** Demo hook: the "Try a sample patient (Margaret)" flow sends "margaret" to
   *  get a deterministic, curated result (see lib/demoMatch). Any other input
   *  ignores this and runs the real live pipeline. */
  demo?: string;
};

const VALID_STUDY_TYPES: StudyTypeKey[] = ["treatment", "tests", "observational", "expanded"];
function sanitizeStudyTypes(input?: string[]): StudyTypeKey[] {
  return (input ?? []).filter((s): s is StudyTypeKey => (VALID_STUDY_TYPES as string[]).includes(s));
}

export async function POST(req: Request) {
  let profile: MatchBody;
  try {
    profile = (await req.json()) as MatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Deterministic demo result for the sample patient — instant, always ≥3
  // eligible, no model call. Only this explicit flag triggers it.
  if (profile.demo === "margaret") {
    return NextResponse.json(margaretDemoMatch(profile.summary));
  }

  const cond = (profile.conditionQuery ?? "").trim();
  if (!cond) {
    return NextResponse.json({ error: "conditionQuery is required." }, { status: 400 });
  }

  const fields = profile.fields ?? [];
  // Prefer the explicitly captured survey location; fall back to any location
  // read out of the note. Distance filtering only bites when we actually have one.
  const patient = derivePatientLoc(fields, profile.location);
  const travelThr = travelThreshold(profile.travel ?? null);
  const now = Date.now();
  const geo: GeoContext = { patient, travelThr, now };

  let pool: Trial[];
  let legs: SearchLeg[];
  try {
    // §4.1: scope the candidate set at the registry so excluded study types never
    // reach the pool and never consume a Claude reasoning call. The terms are
    // unioned: a basket study registered under a broader umbrella is only
    // reachable from a broader term.
    const found = await searchExpanded({
      terms: [cond, ...(profile.conditionQueries ?? [])],
      pageSize: PER_TERM_PAGE,
      studyTypes: sanitizeStudyTypes(profile.studyTypes),
      // Only worth an extra leg when the patient actually cares about distance.
      locn: travelThr > 0 ? (profile.location ?? "").trim() || undefined : undefined,
      cap: CANDIDATE_POOL,
    });
    pool = found.trials;
    legs = found.legs;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trial registry request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const profileText = renderProfile(profile);

  /* --- structural gates: decidable in code, so decided in code --- */
  const demographics = derivePatientDemographics(fields, profile.summary);
  const candidates: Trial[] = [];
  const excluded: TrialMatch[] = [];
  for (const trial of pool) {
    const gate = structuralExclusion(trial, demographics);
    if (gate) {
      excluded.push({
        ...trial,
        status: "excluded",
        headline: gate.reason,
        criteria: [],
        metCount: 0,
        total: 0,
        brief: null,
        factors: computeFactors(trial, geo),
        structuralExclusion: gate.reason,
        triageScore: null,
      });
    } else {
      candidates.push(trial);
    }
  }

  // Compose the addressee voice (§5.3) onto the base system prompt once per search.
  const system = reasonSystem(profile.entrant);

  let reasoned: TrialMatch[];
  let screenedOnly: Trial[];
  let triageScores: Map<string, number>;
  try {
    const client = anthropic();

    // Order the queue by patient-specific plausibility rather than by the
    // registry's own relevance ranking, which knows the search term and nothing
    // about the patient. Ranker only — a failure here falls back to pool order.
    triageScores = await triagePool(client, profileText, candidates);
    const queue = orderByTriage(candidates, triageScores);

    const toReason = queue.slice(0, DEEP_REASON_COUNT);
    screenedOnly = queue.slice(DEEP_REASON_COUNT);

    reasoned = await mapPool(toReason, CONCURRENCY, (trial) =>
      reasonTrial(client, system, profileText, trial, geo, triageScores.get(trial.nctId) ?? null),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reasoning failed.";
    const status = message.includes("ANTHROPIC_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  // Rank on explainable signal only: status first, then absolute counts that
  // mean the same thing across trials (hard failures, open items). Never a
  // met/total ratio, and never a model's self-reported confidence.
  reasoned.sort(compareMatches);

  const screened: TrialMatch[] = screenedOnly.map((t) => ({
    ...t,
    status: "screened" as const,
    headline: "Passed structural gates — not yet reasoned in this pass.",
    criteria: [],
    metCount: 0,
    total: 0,
    brief: null,
    factors: computeFactors(t, geo),
    structuralExclusion: null,
    triageScore: triageScores.get(t.nctId) ?? null,
  }));

  const matches = [...reasoned, ...screened, ...excluded];
  const counts = {
    poolTotal: pool.length,
    reasoned: reasoned.length,
    eligible: reasoned.filter((m) => m.status === "eligible").length,
    uncertain: reasoned.filter((m) => m.status === "uncertain").length,
    near: reasoned.filter((m) => m.status === "near").length,
    screened: screened.length,
    excluded: excluded.length,
  };

  // How the pool was assembled, so coverage is inspectable instead of implied.
  const coverage = {
    terms: legs.map((l) => ({ term: l.term, added: l.added, error: l.error ?? null })),
    triaged: triageScores.size > 0,
  };

  // Location filtering is only meaningful when we have BOTH a patient location
  // and a distance preference — otherwise say so, never imply a filter ran.
  const locationApplied = patient.known && travelThr > 0;
  const location = {
    applied: locationApplied,
    label: (profile.location ?? "").trim(),
    travel: profile.travel ?? null,
    inRange: locationApplied ? reasoned.filter((m) => m.factors.withinRange === true).length : 0,
  };

  return NextResponse.json({ provenance: "live", conditionQuery: cond, summary: profile.summary ?? "", counts, coverage, location, matches });
}

/* ---- triage (reading order) ---- */

/**
 * Score every candidate 0–2 for plausibility, in batches. Purely an ordering
 * signal: on any failure we return an empty map and the pool keeps its registry
 * order, so the expensive-but-safe behavior is the fallback.
 */
async function triagePool(
  client: ReturnType<typeof anthropic>,
  profileText: string,
  candidates: Trial[],
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  // Nothing to order when every candidate gets reasoned anyway.
  if (candidates.length <= DEEP_REASON_COUNT) return scores;

  const batches: Trial[][] = [];
  for (let i = 0; i < candidates.length; i += TRIAGE_BATCH) batches.push(candidates.slice(i, i + TRIAGE_BATCH));

  const settled = await Promise.allSettled(
    batches.map(async (batch) => {
      const listing = batch
        .map(
          (t, i) =>
            `${i + 1}. ${t.nctId} — ${t.title}\n   Phase ${t.phase} · ${t.studyType}${t.primaryPurpose ? ` · ${t.primaryPurpose}` : ""}\n` +
            `   Conditions: ${t.conditions.join("; ") || "—"}\n` +
            `   Interventions: ${t.interventions.map((iv) => iv.name).join("; ") || "—"}`,
        )
        .join("\n");
      const msg = await client.messages.parse({
        model: TRIAGE_MODEL,
        max_tokens: 4000,
        system: TRIAGE_SYSTEM,
        output_config: { format: zodOutputFormat(TriageSchema) },
        messages: [{ role: "user", content: `PATIENT PROFILE\n${profileText}\n\nSTUDIES\n${listing}` }],
      });
      return msg.parsed_output?.items ?? [];
    }),
  );

  for (const result of settled) {
    if (result.status === "rejected") {
      console.warn("[match] triage batch failed; falling back to registry order for it:", result.reason);
      continue;
    }
    for (const item of result.value) {
      const score = Number(item.score);
      if (!Number.isFinite(score)) continue;
      scores.set(item.nctId, Math.max(0, Math.min(2, Math.round(score))));
    }
  }
  return scores;
}

/** Stable descending sort by triage score. Anything the triage pass did not
 *  score keeps a middling score so a batch failure cannot bury those studies
 *  beneath ones a partial pass happened to score low. */
function orderByTriage(candidates: Trial[], scores: Map<string, number>): Trial[] {
  if (scores.size === 0) return candidates;
  return candidates
    .map((trial, index) => ({ trial, index, score: scores.get(trial.nctId) ?? 1 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.trial);
}

/** Run fn over items with at most `limit` in flight; preserves input order. */
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
