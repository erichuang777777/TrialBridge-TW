/* ============================================================================
   Trialign — cohort screening CSV export (§C1 part 2)

   buildCohortCsv turns one /api/screen response into a downloadable matrix: one
   row per patient, in the exact order the route already sorted them
   (compareCohortPatients, lib/verdict.ts) — never re-sorted or re-derived here.

   A plain module, not inside app/screen/page.tsx and not inside a route file
   (Next.js route modules may export only handlers) — so it can be unit-tested
   directly under Node (evals/deterministic.test.ts), without a browser.

   A CSV outlives the screen that produced it: a coordinator pastes it into a
   spreadsheet, forwards it, prints it. So it has to qualify itself the same
   way buildScreeningLog (app/page.tsx) qualifies the per-patient screening
   log — carrying the "not an eligibility determination" framing, and saying
   plainly when the export came from the curated sample cohort rather than a
   live screen.
   ========================================================================== */

import type { Criterion, MatchStatus } from "@/lib/types";
import type { ScreenResponse } from "@/lib/screenTypes";
// Words, not registry enum values — the same rule the screen follows. An
// export that says RECRUITING where the page says "Recruiting" makes the file
// look like a database dump the reader has to decode.
//
// Relative, with the .ts extension, unlike the type-only imports above: this is
// a VALUE import, so it survives into what `npm run eval` executes under plain
// Node — which has no tsconfig path mapping and cannot resolve "@/lib". Same
// reason lib/factors.ts imports "./ctgov.ts".
import { formatSiteStatus } from "./ctgov.ts";

/** RFC 4180 field escaping. Criteria requirement/evidence text routinely
 *  contains commas, quotes, and (via multi-line evidence) newlines, and a
 *  coordinator opens this file in Excel — so quoting has to be exact, not
 *  casual string-joining. Wrap in quotes and double any embedded quote
 *  whenever the field contains a comma, a quote, or a newline (\n or \r). */
export function csvField(value: string): string {
  const v = value ?? "";
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function csvRow(fields: string[]): string {
  return fields.map(csvField).join(",");
}

/** Fixed order so the counts table reads the same on every export, and so a
 *  row is always present for a bucket even when its count is 0 — a status the
 *  UI never mentions is exactly the "four zeroes, no explanation" failure
 *  this file exists to not repeat. */
const STATUS_ORDER: MatchStatus[] = ["eligible", "uncertain", "near", "screened", "excluded"];

/** One line per criterion: "kind/verdict: requirement — evidence", joined with
 *  " | " so a patient's whole ledger fits in one cell. Safe to join on a plain
 *  separator because the WHOLE cell still goes through csvField — an embedded
 *  comma, quote, or " | " inside a single requirement/evidence string is still
 *  escaped correctly; it does not need per-criterion escaping of its own. */
function formatCriteria(criteria: Criterion[]): string {
  return criteria.map((c) => `${c.kind}/${c.verdict}: ${c.requirement}${c.evidence ? ` — ${c.evidence}` : ""}`).join(" | ");
}

const DISCLAIMER =
  "Informational pre-screen against published registry criteria. NOT an eligibility determination " +
  "— only the study team can confirm eligibility, after a screening workup.";
const CURATED_DISCLAIMER =
  "CURATED DEMO COHORT for illustration only — no registry search and no model call were run to " +
  "produce this. Not real patients; not an eligibility determination.";

/** The age is printed always, unlike on the screen, which shows it only once it
 *  is a caveat. The difference is deliberate: the screen is read now, when the
 *  reader can just look again, but a file is read later — and "how fresh was
 *  the record this was screened against" is precisely what cannot be recovered
 *  from the file afterwards. The STALE flag is what carries the judgment, so
 *  the number never has to be interpreted by whoever opens it next. */
function registryAgeNote(trial: ScreenResponse["trial"]): string {
  if (trial.registryAgeDays === null) return "";
  const age = ` · registry record ${trial.registryAgeDays} days old`;
  return trial.registryStale ? `${age} (STALE — re-check before acting on this)` : age;
}

export type CohortCsvOptions = {
  /** True when this export came from the sample cohort fixture rather than a
   *  live /api/screen call (mirrors MatchResponse.provenance === "curated-demo"
   *  on the patient side — see lib/demoMatch.ts). A downloaded file outlives
   *  the screen that qualified it, so this has to be stated IN the file, not
   *  just on the page that produced it. */
  curated?: boolean;
};

/** Build the full cohort matrix as CSV text (CRLF line endings, per RFC 4180 —
 *  what Excel expects). Every patient in `data.patients` becomes exactly one
 *  row, in the order the route already returned: fail-closed, nothing here
 *  re-sorts or drops a row, including structurally gated-out patients. */
export function buildCohortCsv(data: ScreenResponse, opts: CohortCsvOptions = {}): string {
  const { trial, counts, patients } = data;
  const lines: string[] = [];

  lines.push(csvRow(["Trialign cohort screening export"]));
  lines.push(csvRow([`Study: ${trial.nctId} — ${trial.title}`]));
  lines.push(csvRow([`${trial.phase} · ${trial.sponsor} · ${trial.url}`]));
  // The response already carries both of these and the screen shows them; an
  // export that drops them is the worse half of the trade, because a stale or
  // no-longer-recruiting record misleads across a whole cohort at once rather
  // than one patient. Same wording as the per-patient log in app/page.tsx.
  lines.push(csvRow([`Registry status: ${formatSiteStatus(trial.overallStatus) || "not published"}${registryAgeNote(trial)}`]));
  lines.push(csvRow([opts.curated ? CURATED_DISCLAIMER : DISCLAIMER]));
  lines.push("");

  lines.push(csvRow(["Status", "Count"]));
  for (const s of STATUS_ORDER) lines.push(csvRow([s, String(counts[s])]));
  lines.push(csvRow(["total", String(counts.total)]));
  lines.push("");

  lines.push(
    csvRow(["Patient ID", "Status", "Open items", "Hard failures", "Met / Total", "Structural exclusion", "Headline", "Criteria ledger"]),
  );
  for (const p of patients) {
    lines.push(
      csvRow([
        p.id,
        p.status,
        String(p.openCount),
        String(p.hardFailCount),
        `${p.metCount}/${p.total}`,
        p.structuralExclusion ?? "",
        p.headline,
        formatCriteria(p.criteria),
      ]),
    );
  }

  return lines.join("\r\n");
}
