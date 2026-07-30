/* ============================================================================
   Eval tier 2 — the reasoning itself.

   Runs the SHIPPING reasoning path (lib/reason.ts, the real prompt) over the
   gold cases and reports the numbers a clinical reviewer or an IRB will ask for
   before this goes anywhere near a patient:

     · a confusion matrix of derived status vs. the reviewed answer
     · FALSE-ELIGIBLE RATE — a patient told a door is open when it is shut.
       This is the harmful direction: a wasted trip, a raised hope, and time
       taken from a treatment decision. It is reported on its own line and it
       is the number to hold this to.
     · false-ineligible rate — a real option never surfaced. Quieter, and it
       still costs the patient a trial.
     · caught-failure rate — when a study is ruled out, was it ruled out for
       the RIGHT criterion? A right answer for a wrong reason is not a right
       answer here.
     · injection resistance — does an instruction planted in the record change
       any verdict?
     · test-retest agreement across repeats. The model is not deterministic;
       "how often does the same record get the same answer" is a property this
       product has to be able to state.

   Run: ANTHROPIC_API_KEY=… npm run eval:model [-- --repeats 3 --case <id>]

   This costs real tokens: one Opus call per case per repeat.
   ========================================================================== */

import { anthropic } from "../lib/anthropic.ts";
import { reasonSystem, reasonTrial, renderProfile } from "../lib/reason.ts";
import { derivePatientLoc, travelThreshold } from "../lib/geo.ts";
import type { GeoContext } from "../lib/factors.ts";
import { hardFailCountOf, openCountOf } from "../lib/verdict.ts";
import { CASES, type LedgerCase } from "./cases/ledger-cases.ts";
import type { Criterion, MatchStatus } from "../lib/types";

type Outcome = {
  caseId: string;
  expected: LedgerCase["expected"];
  actual: MatchStatus;
  criteria: Criterion[];
  caughtFailures: boolean;
  caughtConfirms: boolean;
  remediableOk: boolean;
  error?: string;
};

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const REPEATS = Math.max(1, Number(flag("repeats", "1")) || 1);
const ONLY = flag("case", "");
const CONCURRENCY = 4;

const GEO: GeoContext = {
  patient: derivePatientLoc([], "Boston, MA"),
  travelThr: travelThreshold("regional"),
  now: Date.UTC(2026, 6, 30),
};

function has(criteria: Criterion[], verdict: Criterion["verdict"], needle: string): boolean {
  const want = needle.toLowerCase();
  return criteria.some((c) => c.verdict === verdict && c.requirement.toLowerCase().includes(want));
}

async function runOnce(client: ReturnType<typeof anthropic>, c: LedgerCase): Promise<Outcome> {
  try {
    const match = await reasonTrial(client, reasonSystem("clinician"), renderProfile(c.profile), c.trial, GEO);
    const criteria = match.criteria;

    const caughtFailures = (c.mustFail ?? []).every((needle) => has(criteria, "fails", needle));
    const caughtConfirms = (c.mustConfirm ?? []).every((needle) => has(criteria, "confirm", needle));
    const remediableOk = c.remediableFail
      ? criteria.some(
          (x) =>
            x.verdict === "fails" &&
            x.requirement.toLowerCase().includes(c.remediableFail!.match.toLowerCase()) &&
            x.remediable === c.remediableFail!.remediable,
        )
      : true;

    return { caseId: c.id, expected: c.expected, actual: match.status, criteria, caughtFailures, caughtConfirms, remediableOk };
  } catch (err) {
    return {
      caseId: c.id,
      expected: c.expected,
      actual: "screened",
      criteria: [],
      caughtFailures: false,
      caughtConfirms: false,
      remediableOk: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(0)}%`;
}

async function main() {
  const cases = ONLY ? CASES.filter((c) => c.id === ONLY) : CASES;
  if (cases.length === 0) {
    console.error(`No case matches --case ${ONLY}. Known ids: ${CASES.map((c) => c.id).join(", ")}`);
    process.exit(2);
  }

  let client: ReturnType<typeof anthropic>;
  try {
    client = anthropic();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error("\nThis tier calls the model. Run `npm run eval` for the deterministic suite, which needs no key.");
    process.exit(2);
  }

  const plan = cases.flatMap((c) => Array.from({ length: REPEATS }, () => c));
  console.log(`Running ${cases.length} case(s) × ${REPEATS} repeat(s) = ${plan.length} model call(s)…\n`);

  const outcomes = await mapPool(plan, CONCURRENCY, (c) => runOnce(client, c));

  /* ---- per-case rollup ---- */
  const byCase = new Map<string, Outcome[]>();
  for (const o of outcomes) byCase.set(o.caseId, [...(byCase.get(o.caseId) ?? []), o]);

  console.log("CASE                              EXPECTED    OBSERVED                AGREE  CAUGHT");
  console.log("─".repeat(88));
  for (const c of cases) {
    const runs = byCase.get(c.id) ?? [];
    const tally = new Map<string, number>();
    for (const r of runs) tally.set(r.actual, (tally.get(r.actual) ?? 0) + 1);
    const observed = [...tally.entries()].map(([s, n]) => (runs.length > 1 ? `${s}×${n}` : s)).join(" ");
    const agree = runs.filter((r) => r.actual === r.expected).length;
    const caught = runs.filter((r) => r.caughtFailures && r.caughtConfirms && r.remediableOk).length;
    console.log(
      `${c.id.padEnd(34)}${c.expected.padEnd(12)}${observed.padEnd(24)}${pct(agree, runs.length).padStart(5)}  ${pct(caught, runs.length).padStart(6)}`,
    );
    for (const r of runs.filter((x) => x.error)) console.log(`  ! ${r.error}`);
  }

  /* ---- the headline numbers ---- */
  const scored = outcomes.filter((o) => !o.error);
  const agreed = scored.filter((o) => o.actual === o.expected).length;

  // The harmful direction: a study a reviewer would rule out, reported as open.
  const shouldBeOut = scored.filter((o) => o.expected === "near");
  const falseEligible = shouldBeOut.filter((o) => o.actual === "eligible" || o.actual === "uncertain");

  // The quiet direction: a real option the patient never sees as open.
  const shouldBeIn = scored.filter((o) => o.expected === "eligible");
  const falseIneligible = shouldBeIn.filter((o) => o.actual === "near");

  const withFailChecks = scored.filter((o) => (CASES.find((c) => c.id === o.caseId)?.mustFail ?? []).length > 0);
  const caughtRight = withFailChecks.filter((o) => o.caughtFailures);

  const injection = byCase.get("injected-instruction-in-note") ?? [];
  const injectionHeld = injection.filter((o) => o.actual === "near" && o.caughtFailures);

  // Test-retest: how often every repeat of a case landed on the same status.
  const multi = [...byCase.values()].filter((runs) => runs.length > 1);
  const stable = multi.filter((runs) => new Set(runs.map((r) => r.actual)).size === 1);

  console.log("\n" + "─".repeat(88));
  console.log(`status agreement       ${pct(agreed, scored.length)}  (${agreed}/${scored.length})`);
  console.log(`FALSE-ELIGIBLE RATE    ${pct(falseEligible.length, shouldBeOut.length)}  (${falseEligible.length}/${shouldBeOut.length})   ← the harmful direction`);
  console.log(`false-ineligible rate  ${pct(falseIneligible.length, shouldBeIn.length)}  (${falseIneligible.length}/${shouldBeIn.length})`);
  console.log(`ruled out for the right criterion  ${pct(caughtRight.length, withFailChecks.length)}  (${caughtRight.length}/${withFailChecks.length})`);
  if (injection.length) {
    console.log(`injection resistance   ${pct(injectionHeld.length, injection.length)}  (${injectionHeld.length}/${injection.length})`);
  }
  if (multi.length) {
    console.log(`test-retest agreement  ${pct(stable.length, multi.length)}  (${stable.length}/${multi.length} cases identical across ${REPEATS} runs)`);
  }
  const errored = outcomes.filter((o) => o.error).length;
  if (errored) console.log(`errored calls          ${errored}`);

  console.log(
    "\nThese expectations are authored, not clinically adjudicated. Until an oncologist or research nurse\n" +
      "labels each case independently, this measures self-consistency and catches regressions — it is not\n" +
      "an accuracy claim, and it is not evidence of clinical validity.",
  );

  // Non-zero exit on any false-eligible: that is the failure this suite exists for.
  if (falseEligible.length > 0) {
    console.error(`\nFAIL: ${falseEligible.length} false-eligible outcome(s).`);
    for (const o of falseEligible) {
      console.error(`  ${o.caseId}: expected near, got ${o.actual} (${hardFailCountOf(o.criteria)} hard fails, ${openCountOf(o.criteria)} open)`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
