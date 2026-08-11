/* ============================================================================
   Adjudicated cases — the bridge from a coordinator's downloaded correction
   to a runnable LedgerCase.

   evals/cases/ledger-cases.ts is TypeScript: authored cases are built with
   the `trial()` fixture helper and live in source control as code. A
   clinician's correction is not code — it is a JSON file a coordinator
   downloaded from /screen (see lib/feedback.ts and app/screen/page.tsx's
   "Export correction (JSON)" button) — so it needs its own on-ramp rather
   than asking a coordinator to write TypeScript.

   The chosen bridge: this directory (evals/cases/adjudicated/) holds one
   exported *.json file per correction, alongside the authored cases in
   ledger-cases.ts rather than replacing them. loadAdjudicatedCases() reads
   every file in it, validates each with lib/feedback.ts's
   parseAdjudicatedCase (malformed JSON or a wrong shape throws — a broken
   file must fail loudly, not be skipped and silently understate how many
   cases ran), and converts it to a LedgerCase with `adjudicated: true` set.
   evals/ledger.ts merges the result into CASES and reports the two kinds
   separately, because "how many of our gold cases are actually
   clinician-adjudicated" is the number the roadmap says matters — a count
   that quietly blends into "23 cases" would bury exactly the fact this
   whole mechanism exists to surface.

   The directory need not exist yet — a fresh checkout with no corrections
   filed is not an error, it is the starting state this feature is meant to
   move away from one file at a time.
   ========================================================================== */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAdjudicatedCase, toLedgerCase } from "../../lib/feedback.ts";
import type { LedgerCase } from "./ledger-cases.ts";

export const ADJUDICATED_DIR = join(dirname(fileURLToPath(import.meta.url)), "adjudicated");

/** A correction that is real feedback but must not be scored: the deciding
 *  fact was never in the record the model reasoned over, so the model reaching
 *  the app's answer was correct. Surfaced rather than filtered — see
 *  lib/feedback.ts's CorrectionBasis. */
export type ExcludedAdjudication = { file: string; id: string; reason: string };

export type AdjudicatedLoad = {
  /** Cases that may be scored against the model. */
  gold: LedgerCase[];
  /** Cases deliberately kept out of the gold set, with why. Never empty-
   *  handed: the caller is expected to report these, because a correction that
   *  vanishes between the coordinator's screen and the scorecard makes the
   *  suite look more thoroughly adjudicated than it is. */
  excluded: ExcludedAdjudication[];
};

/** Load every *.json file in `dir` (default: evals/cases/adjudicated/). Throws,
 *  naming the offending file, on anything malformed — a coordinator's
 *  correction that fails to parse must stop the suite, not be dropped from the
 *  count. */
export function loadAdjudicatedCases(dir: string = ADJUDICATED_DIR): AdjudicatedLoad {
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return { gold: [], excluded: [] };
    throw err;
  }

  const gold: LedgerCase[] = [];
  const excluded: ExcludedAdjudication[] = [];
  for (const f of files) {
    const raw = readFileSync(join(dir, f), "utf8");
    const parsed = parseAdjudicatedCase(raw);
    if (!parsed.ok) {
      throw new Error(`evals/cases/adjudicated/${f} is not a valid adjudicated case: ${parsed.error}`);
    }
    if (parsed.case.evalUsable) gold.push(toLedgerCase(parsed.case));
    else excluded.push({ file: f, id: parsed.case.id, reason: parsed.case.evalUsableReason });
  }
  return { gold, excluded };
}
