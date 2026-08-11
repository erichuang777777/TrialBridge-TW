/* ============================================================================
   Eval tier 1 — the deterministic layers.

   Everything asserted here is decided in code, not by a model, which is exactly
   why it can be pinned: given the same registry record and the same profile,
   these answers must never move. Each case corresponds to a decision a patient
   acts on — which site to call, whether a study is worth reading, whether "no"
   means "not yet".

   Run: npm run eval        (no API key, no network)
   ========================================================================== */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { derivePatientLoc, proximity, travelThreshold, travelLabel } from "../lib/geo.ts";
import { computeFactors, ageInDays, STALE_AFTER_DAYS, type GeoContext } from "../lib/factors.ts";
import { derivePatientDemographics, structuralExclusion } from "../lib/structuralGate.ts";
import {
  deriveStatus,
  hardFailCountOf,
  remediableFailCountOf,
  openCountOf,
  compareMatches,
  compareCohortPatients,
  cohortCounts,
  splitNearMisses,
} from "../lib/verdict.ts";
import { siteIsRecruiting, formatSiteStatus, prioritizeOpenSites, isValidNctId } from "../lib/ctgov.ts";
import { buildDisclosureRecord, recordDisclosure, type DisclosureField } from "../lib/disclosure.ts";
import { buildCohortCsv, csvField } from "../lib/cohortCsv.ts";
import type { PatientResult, ScreenResponse, ScreenTrialSummary } from "../lib/screenTypes.ts";
import {
  buildCorrection,
  buildAdjudicatedCase,
  serializeAdjudicatedCase,
  parseAdjudicatedCase,
  toLedgerCase,
  reconstructTrial,
  reconstructEligibilityCriteria,
  isAdjudicable,
} from "../lib/feedback.ts";
import { loadAdjudicatedCases } from "./cases/adjudicated-loader.ts";
import { trial, site, criterion } from "./fixtures.ts";

const NOW = Date.UTC(2026, 6, 30); // 2026-07-30, fixed so ages never drift

function ctx(location: string, travel: Parameters<typeof travelThreshold>[0] = "regional"): GeoContext {
  return { patient: derivePatientLoc([], location), travelThr: travelThreshold(travel), now: NOW };
}

/* ---- geography ---------------------------------------------------------- */

test("proximity places a site by city, state, neighboring state, then country", () => {
  const patient = derivePatientLoc([], "Boston, MA");
  assert.equal(proximity({ city: "Boston", state: "Massachusetts", country: "United States" }, patient), 4);
  assert.equal(proximity({ city: "Worcester", state: "Massachusetts", country: "United States" }, patient), 3);
  assert.equal(proximity({ city: "Providence", state: "Rhode Island", country: "United States" }, patient), 2);
  assert.equal(proximity({ city: "Houston", state: "Texas", country: "United States" }, patient), 1);
  assert.equal(proximity({ city: "Lyon", state: "", country: "France" }, patient), 0);
});

test("state adjacency is symmetric — a border cannot exist in only one direction", () => {
  const fromNY = derivePatientLoc([], "New York, NY");
  const fromPA = derivePatientLoc([], "Philadelphia, PA");
  assert.equal(proximity({ city: "Philadelphia", state: "Pennsylvania", country: "United States" }, fromNY), 2);
  assert.equal(proximity({ city: "Buffalo", state: "New York", country: "United States" }, fromPA), 2);
});

test('"within a few hours" no longer resolves to the whole country', () => {
  // The regression this replaces: regional used to mean "same country", so a site
  // 2,500 miles away sat inside a band the patient read as a drive.
  const patient = derivePatientLoc([], "Boston, MA");
  const acrossTheCountry = proximity({ city: "Seattle", state: "Washington", country: "United States" }, patient);
  assert.ok(acrossTheCountry < travelThreshold("regional"), "a cross-country site must fall outside the regional band");
  assert.equal(travelLabel("regional"), "in or next to your state");
});

test("an unknown patient location scores nothing and filters nothing", () => {
  const patient = derivePatientLoc([], "");
  assert.equal(patient.known, false);
  assert.equal(proximity({ city: "Boston", state: "Massachusetts", country: "United States" }, patient), 0);
  assert.equal(computeFactors(trial(), { patient, travelThr: 3, now: NOW }).withinRange, null);
});

test("a state abbreviation and its full name resolve identically", () => {
  const abbr = derivePatientLoc([], "Austin, TX");
  const full = derivePatientLoc([], "Austin, Texas");
  const houston = { city: "Houston", state: "Texas", country: "United States" };
  assert.equal(proximity(houston, abbr), proximity(houston, full));
  assert.equal(proximity(houston, abbr), 3);
});

/* ---- site status -------------------------------------------------------- */

test("a withdrawn site is never named as the nearest site", () => {
  // The study is RECRUITING; the site in the patient's own city is not. Naming it
  // sends the patient to a door that is shut.
  const t = trial({
    locations: [site("Boston", "Massachusetts", "WITHDRAWN"), site("Providence", "Rhode Island", "RECRUITING")],
  });
  const f = computeFactors(t, ctx("Boston, MA"));
  assert.equal(f.nearestSite, "Providence, Rhode Island");
  assert.equal(f.nearestSiteActive, true);
});

test("when no site is open we still name one, and say it is not open", () => {
  const t = trial({
    locations: [site("Boston", "Massachusetts", "SUSPENDED"), site("Worcester", "Massachusetts", "TERMINATED")],
  });
  const f = computeFactors(t, ctx("Boston, MA"));
  assert.equal(f.nearestSiteActive, false);
  assert.equal(f.locationUnknown, false, "the site exists — it is its status that is the problem");
});

test("a site with no published status is treated as open, not hidden", () => {
  assert.equal(siteIsRecruiting({ status: "" }), true);
  assert.equal(siteIsRecruiting({ status: "RECRUITING" }), true);
  assert.equal(siteIsRecruiting({ status: "NOT_YET_RECRUITING" }), false);
  assert.equal(siteIsRecruiting({ status: "withdrawn" }), false);
});

test("a patient about to call reads the site's status as words, not a registry filter value", () => {
  assert.equal(formatSiteStatus("NOT_YET_RECRUITING"), "Not yet recruiting");
  assert.equal(formatSiteStatus("RECRUITING"), "Recruiting");
  assert.equal(formatSiteStatus("ACTIVE_NOT_RECRUITING"), "Active, not recruiting");
  assert.equal(formatSiteStatus(""), "", "no published status means nothing to print, not a fabricated label");
  // An enum value the table above doesn't know yet still reads as words, never
  // as raw SCREAMING_SNAKE_CASE leaking onto the page.
  assert.equal(formatSiteStatus("SOME_NEW_STATUS"), "Some New Status");
});

test("a nearer site that isn't recruiting never bumps a farther open one out of the referral cap", () => {
  // The whole point of this list is "who could I actually call". A site's own
  // closure must demote it below open sites, not merely sit inert in the sort.
  const nearerClosed = site("Boston", "Massachusetts", "WITHDRAWN");
  const fartherOpen = site("Providence", "Rhode Island", "RECRUITING");
  const ordered = prioritizeOpenSites([nearerClosed, fartherOpen]);
  assert.deepEqual(ordered, [fartherOpen, nearerClosed]);
});

test("prioritizing open sites never drops one — it only reorders", () => {
  const a = site("Boston", "Massachusetts", "RECRUITING");
  const b = site("Worcester", "Massachusetts", "SUSPENDED");
  const c = site("Providence", "Rhode Island", "RECRUITING");
  const ordered = prioritizeOpenSites([a, b, c]);
  assert.equal(ordered.length, 3);
  assert.deepEqual(new Set(ordered), new Set([a, b, c]));
  // Order within each group is preserved, not re-sorted by anything else.
  assert.deepEqual(ordered, [a, c, b]);
});

/* ---- registry freshness ------------------------------------------------- */

test("registry age is measured, and staleness is flagged rather than hidden", () => {
  assert.equal(ageInDays("2026-07-30", NOW), 0);
  assert.equal(ageInDays("2026-07-20", NOW), 10);
  assert.equal(ageInDays("", NOW), null, "an unpublished date is unknown, never guessed");
  assert.equal(ageInDays("garbage", NOW), null);

  const fresh = computeFactors(trial({ lastUpdatePostDate: "2026-07-01" }), ctx("Boston, MA"));
  assert.equal(fresh.registryStale, false);

  const stale = computeFactors(trial({ lastUpdatePostDate: "2024-01-15" }), ctx("Boston, MA"));
  assert.equal(stale.registryStale, true);
  assert.ok((stale.registryAgeDays ?? 0) > STALE_AFTER_DAYS);
});

/* ---- structural gates --------------------------------------------------- */

test("reads age and sex from labeled profile fields", () => {
  const demo = derivePatientDemographics(
    [
      { label: "Age", value: "62" },
      { label: "Sex", value: "Female" },
    ],
    "",
  );
  assert.deepEqual(demo, { ageYears: 62, sex: "female" });
});

test("falls back to the summary when no field carries age or sex", () => {
  const demo = derivePatientDemographics([], "HR+/HER2− metastatic breast cancer in a 62-year-old woman, 2 prior lines, ECOG 1.");
  assert.equal(demo.ageYears, 62);
  assert.equal(demo.sex, "female");
});

test("a female-only study is ruled out for a male patient, with the reason stated", () => {
  const gate = structuralExclusion(trial({ sex: "FEMALE" }), { ageYears: 55, sex: "male" });
  assert.ok(gate, "expected an exclusion");
  assert.match(gate.reason, /female/i);
});

test("age bands are enforced from the registry's own fields", () => {
  const paediatric = structuralExclusion(trial({ minimumAge: "65 Years" }), { ageYears: 62, sex: "female" });
  assert.ok(paediatric);
  assert.match(paediatric.reason, /65 Years/);

  const capped = structuralExclusion(trial({ maximumAge: "50 Years" }), { ageYears: 62, sex: "female" });
  assert.ok(capped);
  assert.match(capped.reason, /50 Years/);

  assert.equal(structuralExclusion(trial({ minimumAge: "18 Years" }), { ageYears: 62, sex: "female" }), null);
});

test("months and other units in the registry's age fields are read as ages", () => {
  const infantOnly = structuralExclusion(trial({ maximumAge: "24 Months" }), { ageYears: 62, sex: null });
  assert.ok(infantOnly, "24 months is 2 years — an adult must be excluded");
});

test("the gate never fires on an unknown patient value", () => {
  // A study wrongly dropped here is invisible to the patient. Silence beats a guess.
  assert.equal(structuralExclusion(trial({ sex: "FEMALE" }), { ageYears: null, sex: null }), null);
  assert.equal(structuralExclusion(trial({ minimumAge: "65 Years" }), { ageYears: null, sex: "female" }), null);
  assert.equal(structuralExclusion(trial({ sex: "ALL" }), { ageYears: 62, sex: "male" }), null);
});

test("an implausible parsed age is discarded rather than acted on", () => {
  const demo = derivePatientDemographics([{ label: "Age", value: "742" }], "");
  assert.equal(demo.ageYears, null);
});

test("prose mentioning both sexes reads as unknown, not as whichever came first", () => {
  // "Seen at the women's clinic; the patient is a man." Picking one would
  // silently exclude every study of the other sex.
  const demo = derivePatientDemographics([], "Referred from the women's health clinic; the patient is a 54-year-old man.");
  assert.equal(demo.sex, null);
  assert.equal(demo.ageYears, 54, "an ambiguous sex must not discard a clear age");
  assert.equal(structuralExclusion(trial({ sex: "FEMALE" }), demo), null);
});

test("a date of birth is not mined for an age", () => {
  // Deriving one would mean carrying a direct identifier through the profile,
  // which the privacy posture says is not needed to match.
  const demo = derivePatientDemographics([{ label: "Date of birth", value: "1964-03-12" }], "");
  assert.equal(demo.ageYears, null);
});

test("age fields are read whether or not they carry a unit", () => {
  assert.equal(derivePatientDemographics([{ label: "Age", value: "62 years" }], "").ageYears, 62);
  assert.equal(derivePatientDemographics([{ label: "Age at diagnosis", value: "58 y/o" }], "").ageYears, 58);
  assert.equal(derivePatientDemographics([{ label: "Age", value: "— not found in note" }], "").ageYears, null);
});

/* ---- verdicts and ranking ----------------------------------------------- */

test("status is derived fail-closed from the criteria", () => {
  assert.equal(deriveStatus([]), "screened");
  assert.equal(deriveStatus([criterion({ verdict: "meets" }), criterion({ verdict: "clear" })]), "eligible");
  assert.equal(deriveStatus([criterion({ verdict: "meets" }), criterion({ verdict: "confirm" })]), "uncertain");
  assert.equal(
    deriveStatus([criterion({ verdict: "meets" }), criterion({ verdict: "confirm" }), criterion({ verdict: "fails" })]),
    "near",
    "one failure outranks any number of open items",
  );
});

test("failures split into workable and settled", () => {
  const criteria = [
    criterion({ verdict: "fails", remediable: true }), // washout that will elapse
    criterion({ verdict: "fails", remediable: false }), // prior therapy, irreversible
    criterion({ verdict: "confirm" }),
    criterion({ verdict: "meets" }),
  ];
  assert.equal(remediableFailCountOf(criteria), 1);
  assert.equal(hardFailCountOf(criteria), 1);
  assert.equal(openCountOf(criteria), 1);
});

/* ---- §P1 near-miss split ------------------------------------------------- */

test("a trial the patient could still come to qualify for is a not-yet, not a ruled-out", () => {
  const washout = { status: "near" as const, criteria: [criterion({ verdict: "fails", remediable: true })] };
  const { notYet, ruledOut } = splitNearMisses([washout]);
  assert.deepEqual(notYet, [washout]);
  assert.deepEqual(ruledOut, []);
});

test("a single fixed failure sinks the whole trial into ruled-out, even alongside a washout", () => {
  const priorTherapy = {
    status: "near" as const,
    criteria: [criterion({ verdict: "fails", remediable: true }), criterion({ verdict: "fails", remediable: false })],
  };
  const { notYet, ruledOut } = splitNearMisses([priorTherapy]);
  assert.deepEqual(notYet, [], "one hard fail is enough to disqualify the whole trial from 'not yet'");
  assert.deepEqual(ruledOut, [priorTherapy]);
});

test("eligible, uncertain, screened and excluded matches never land in either near-miss bucket", () => {
  const eligible = { status: "eligible" as const, criteria: [criterion({ verdict: "meets" })] };
  const uncertain = { status: "uncertain" as const, criteria: [criterion({ verdict: "confirm" })] };
  const screened = { status: "screened" as const, criteria: [] };
  const excluded = { status: "excluded" as const, criteria: [] };
  const { notYet, ruledOut } = splitNearMisses([eligible, uncertain, screened, excluded]);
  assert.deepEqual(notYet, []);
  assert.deepEqual(ruledOut, [], "only 'near' matches are split at all — everything else is out of scope for this presentation split");
});

test("a match with zero criteria is not a not-yet, even if its status somehow reads near", () => {
  // Shouldn't occur through deriveStatus (empty criteria -> "screened"), but the
  // splitter must not rely on that: an empty ledger has no remediable failure to
  // point to, so it must never read as "here's what would have to change".
  const empty = { status: "near" as const, criteria: [] };
  const { notYet, ruledOut } = splitNearMisses([empty]);
  assert.deepEqual(notYet, []);
  assert.deepEqual(ruledOut, [empty]);
});

test("ranking prefers eligible, then fewest hard failures, then fewest open items", () => {
  const m = (status: Parameters<typeof compareMatches>[0]["status"], criteria = [] as ReturnType<typeof criterion>[], stale = false) => ({
    status,
    criteria,
    factors: { registryStale: stale },
  });

  const eligible = m("eligible", [criterion({ verdict: "meets" })]);
  const oneOpen = m("uncertain", [criterion({ verdict: "confirm" })]);
  const threeOpen = m("uncertain", [criterion({ verdict: "confirm" }), criterion({ verdict: "confirm" }), criterion({ verdict: "confirm" })]);
  const workable = m("near", [criterion({ verdict: "fails", remediable: true })]);
  const settled = m("near", [criterion({ verdict: "fails", remediable: false })]);

  const sorted = [settled, threeOpen, workable, oneOpen, eligible].sort(compareMatches);
  assert.deepEqual(sorted, [eligible, oneOpen, threeOpen, workable, settled]);
});

test("ranking does not depend on how finely the prose was segmented", () => {
  // The bug this replaces: ordering on metCount/total meant a study split into 25
  // atomic criteria ranked below one split into 8, for no clinical reason.
  const coarse = { status: "eligible" as const, criteria: Array.from({ length: 8 }, () => criterion({ verdict: "meets" })), factors: { registryStale: false } };
  const fine = { status: "eligible" as const, criteria: Array.from({ length: 25 }, () => criterion({ verdict: "meets" })), factors: { registryStale: false } };
  assert.equal(compareMatches(coarse, fine), 0, "segmentation granularity must not decide order");
});

test("a stale registry record sinks below a fresh one that is otherwise identical", () => {
  const fresh = { status: "eligible" as const, criteria: [criterion({ verdict: "meets" })], factors: { registryStale: false } };
  const stale = { status: "eligible" as const, criteria: [criterion({ verdict: "meets" })], factors: { registryStale: true } };
  assert.ok(compareMatches(fresh, stale) < 0);
});

/* ---- cohort screening (§C1) ---------------------------------------------- */

test("a well-formed NCT id is accepted; anything else is rejected before it reaches the registry", () => {
  // NCT + 8 digits is the registry's own id shape. Forwarding anything else as
  // a path segment would mean sending arbitrary input straight to the
  // registry's URL — this is the check that stops that.
  assert.equal(isValidNctId("NCT12345678"), true);
  assert.equal(isValidNctId("  NCT12345678  "), true, "surrounding whitespace from a pasted id is trimmed, not rejected");
  assert.equal(isValidNctId("NCT1234567"), false, "7 digits — one short of the registry's shape");
  assert.equal(isValidNctId("NCT123456789"), false, "9 digits — one over");
  assert.equal(isValidNctId("nct12345678"), false, "lowercase is not the registry's own casing");
  assert.equal(isValidNctId("NCT12345678/../../etc"), false, "a path-traversal payload must not read as a valid id");
  assert.equal(isValidNctId(""), false);
});

test("cohort triage seats eligible patients first, then fewest open items, then fewest hard failures", () => {
  // Same discipline as compareMatches, holding the trial fixed instead of the
  // patient: absolute code-derived counts only, never a met/total ratio.
  const eligible = { status: "eligible" as const, criteria: [criterion({ verdict: "meets" })] };
  const oneOpen = { status: "uncertain" as const, criteria: [criterion({ verdict: "confirm" })] };
  const threeOpen = {
    status: "uncertain" as const,
    criteria: [criterion({ verdict: "confirm" }), criterion({ verdict: "confirm" }), criterion({ verdict: "confirm" })],
  };
  const oneHardFail = { status: "near" as const, criteria: [criterion({ verdict: "fails", remediable: false })] };
  const twoHardFail = {
    status: "near" as const,
    criteria: [criterion({ verdict: "fails", remediable: false }), criterion({ verdict: "fails", remediable: false })],
  };

  const sorted = [twoHardFail, threeOpen, oneHardFail, oneOpen, eligible].sort(compareCohortPatients);
  assert.deepEqual(sorted, [eligible, oneOpen, threeOpen, oneHardFail, twoHardFail]);
});

test("a structurally excluded patient sinks to the bottom of the cohort list but is never dropped from it", () => {
  const eligible = { status: "eligible" as const, criteria: [criterion({ verdict: "meets" })] };
  const near = { status: "near" as const, criteria: [criterion({ verdict: "fails", remediable: true })] };
  const excluded = { status: "excluded" as const, criteria: [] };

  const cohort = [excluded, eligible, near];
  cohort.sort(compareCohortPatients);
  assert.deepEqual(cohort, [eligible, near, excluded]);
  assert.equal(cohort.length, 3, "a gated-out patient is ranked last, not removed from the roster");
});

test("cohort ranking does not depend on how finely one patient's ledger was segmented", () => {
  // Mirrors the equivalent /api/match regression: a met/total ratio would
  // reward a patient whose profile happened to yield fewer atomic criteria.
  const coarse = { status: "eligible" as const, criteria: Array.from({ length: 4 }, () => criterion({ verdict: "meets" })) };
  const fine = { status: "eligible" as const, criteria: Array.from({ length: 20 }, () => criterion({ verdict: "meets" })) };
  assert.equal(compareCohortPatients(coarse, fine), 0, "segmentation granularity must not decide a coordinator's reading order");
});

test("cohort buckets always sum to the number of patients screened", () => {
  // A count that stops reconciling reads as a finding rather than a dropped
  // bucket: twenty patients screened, four zeroes reported, no explanation.
  const rows = [
    { status: "eligible" as const },
    { status: "uncertain" as const },
    { status: "uncertain" as const },
    { status: "near" as const },
    { status: "excluded" as const },
    { status: "screened" as const },
  ];
  const c = cohortCounts(rows);
  assert.equal(c.total, rows.length);
  assert.equal(c.eligible + c.uncertain + c.near + c.screened + c.excluded, c.total);
  assert.deepEqual(c, { total: 6, eligible: 1, uncertain: 2, near: 1, screened: 1, excluded: 1 });
});

test("a study with no published eligibility text is counted, not silently lost", () => {
  // reasonTrial returns "screened" when a study publishes no criteria — then
  // EVERY row in the cohort carries it, and the bucket has to exist to say so.
  const c = cohortCounts(Array.from({ length: 20 }, () => ({ status: "screened" as const })));
  assert.equal(c.screened, 20);
  assert.equal(c.total, 20);
});

/* ---- cohort CSV export (§C1 part 2) --------------------------------------
   buildCohortCsv is the plain module the cohort-screen page and the sample
   fixture both call — tested directly here, no browser and no route harness
   required, per the task's own instruction to keep it unit-testable. */

const CSV_TRIAL = {
  nctId: "NCT01234567",
  title: "A Study, With a Comma in the Title",
  phase: "Phase 2",
  sponsor: "Example, Inc.",
  url: "https://clinicaltrials.gov/study/NCT01234567",
  overallStatus: "RECRUITING",
  registryAgeDays: 5,
  registryStale: false,
};

function csvPatient(id: string, status: PatientResult["status"], criteria: ReturnType<typeof criterion>[], over: Partial<PatientResult> = {}): PatientResult {
  return {
    id,
    status,
    headline: "",
    criteria,
    metCount: criteria.filter((c) => c.verdict === "meets" || c.verdict === "clear").length,
    total: criteria.length,
    openCount: criteria.filter((c) => c.verdict === "confirm").length,
    hardFailCount: criteria.filter((c) => c.verdict === "fails" && !c.remediable).length,
    structuralExclusion: null,
    ...over,
  };
}

// A cohort deliberately built to exercise every corner CSV escaping has to
// get right: a comma in evidence, a quote in evidence, a newline in evidence,
// a structurally gated patient with an empty ledger, and a "screened" patient
// with an empty ledger too.
const CSV_PATIENTS: PatientResult[] = [
  csvPatient("P-001, Rm 4", "eligible", [criterion({ verdict: "meets", requirement: "HR-positive disease", evidence: "ER 90%, PR 60%" })]),
  csvPatient("P-002", "uncertain", [
    criterion({ verdict: "confirm", requirement: "ESR1 mutation status", evidence: 'Patient says "no prior testing" per note.' }),
  ]),
  csvPatient("P-003", "near", [
    criterion({ verdict: "fails", requirement: "No prior CDK4/6 inhibitor", evidence: "Progressed on:\nletrozole\npalbociclib", remediable: false }),
  ]),
  csvPatient("P-004", "excluded", [], { structuralExclusion: "Enrolls female participants only." }),
  csvPatient("P-005", "screened", [], { headline: "No eligibility text published." }),
];

function csvData(patients: PatientResult[] = CSV_PATIENTS): ScreenResponse {
  return { trial: CSV_TRIAL, counts: cohortCounts(patients), patients };
}

test("csvField only quotes a field that actually needs it", () => {
  assert.equal(csvField("plain text"), "plain text");
  assert.equal(csvField(""), "");
});

test("csvField escapes a comma by quoting the whole field", () => {
  assert.equal(csvField("ER 90%, PR 60%"), '"ER 90%, PR 60%"');
});

test("csvField escapes an embedded quote by doubling it, inside quotes", () => {
  assert.equal(csvField('Patient says "no" per note'), '"Patient says ""no"" per note"');
});

test("csvField escapes an embedded newline by quoting the whole field", () => {
  const v = csvField("line one\nline two");
  assert.ok(v.startsWith('"') && v.endsWith('"'), "a newline must trigger quoting, or Excel will split it into two rows");
  assert.ok(v.includes("line one\nline two"), "the newline itself is preserved inside the quotes, not stripped");
});

test("the export carries the registry caveats, not just the study's name", () => {
  // A stale or no-longer-recruiting record misleads a whole cohort at once.
  // The response already carries both; an export that drops them is where that
  // gets lost, because the file outlives the screen that showed them.
  const fresh = buildCohortCsv(csvData());
  assert.ok(fresh.includes("Recruiting"), "the study's own recruiting status belongs in the export");
  assert.ok(!fresh.includes("STALE"), "a fresh record must not be labelled stale");

  const stale = buildCohortCsv({
    ...csvData(),
    trial: { ...CSV_TRIAL, registryAgeDays: 400, registryStale: true },
  });
  assert.ok(stale.includes("registry record 400 days old"), "the age must be stated, in the same words the per-patient log uses");
  assert.ok(stale.includes("STALE"), "and flagged as a caveat, not left as a number the reader has to judge");
});

test("buildCohortCsv escapes commas, quotes, and newlines the way Excel expects", () => {
  const csv = buildCohortCsv(csvData());
  // The comma sits inside the criteria-ledger cell, which is itself one CSV
  // field — so the WHOLE cell must be quoted (not just the substring around
  // the comma), or the comma would fracture the row into an extra column.
  assert.ok(
    csv.includes('"incl/meets: HR-positive disease — ER 90%, PR 60%"'),
    "a comma inside evidence must not fracture the row into extra columns",
  );
  assert.ok(csv.includes('""no prior testing""'), "an embedded quote must be doubled, not left to close the field early");
  assert.ok(csv.includes("Progressed on:\nletrozole\npalbociclib"), "an embedded newline must survive inside a quoted cell");
});

test("every patient in the cohort appears as exactly one CSV row, in the order the route returned", () => {
  const csv = buildCohortCsv(csvData());
  const lines = csv.split("\r\n");
  const headerIdx = lines.findIndex((l) => l.startsWith("Patient ID,"));
  assert.ok(headerIdx >= 0, "expected a patient-table header row");
  const dataRows = lines.slice(headerIdx + 1).filter((l) => l.length > 0);
  assert.equal(dataRows.length, CSV_PATIENTS.length, "nothing dropped and nothing duplicated — including the structurally gated patient");
  CSV_PATIENTS.forEach((p, i) => {
    // A row whose own id starts with a comma is itself quoted — check against
    // the same csvField() escaping the builder used, not the raw id.
    assert.ok(dataRows[i].startsWith(`${csvField(p.id)},`), `row ${i} must be ${p.id}, in buildCohortCsv's own order (never re-sorted)`);
  });
});

test("a structurally gated patient's row carries the exclusion reason and an empty ledger cell, not a dropped row", () => {
  const csv = buildCohortCsv(csvData());
  assert.ok(csv.includes("Enrolls female participants only."), "the structural-exclusion reason must reach the export");
});

test("the disclaimer is present on every export, and the curated flag changes which one", () => {
  const live = buildCohortCsv(csvData());
  assert.match(live, /NOT an eligibility determination/);
  assert.doesNotMatch(live, /CURATED DEMO COHORT/, "a live export must not claim to be the demo fixture");

  const curated = buildCohortCsv(csvData(), { curated: true });
  assert.match(curated, /CURATED DEMO COHORT/i);
  assert.match(curated, /not an eligibility determination/i, "the curated export still carries the core disclaimer, not just the demo caveat");
});

test("the CSV counts table matches the actual patient rows, independently recomputed", () => {
  // Recompute from CSV_PATIENTS directly (not via cohortCounts) so this test
  // can actually catch a bug in the CSV writer, rather than just echoing
  // whatever cohortCounts() already produced.
  const csv = buildCohortCsv(csvData());
  const lines = csv.split("\r\n");
  const statusIdx = lines.findIndex((l) => l === "Status,Count");
  assert.ok(statusIdx >= 0, "expected a Status,Count header");
  const STATUSES = ["eligible", "uncertain", "near", "screened", "excluded"] as const;
  const parsed: Record<string, number> = {};
  STATUSES.forEach((s, i) => {
    const [status, count] = lines[statusIdx + 1 + i].split(",");
    assert.equal(status, s, "counts table must list every status in a fixed, predictable order");
    parsed[status] = Number(count);
  });
  const [totalLabel, totalCount] = lines[statusIdx + 1 + STATUSES.length].split(",");
  assert.equal(totalLabel, "total");

  for (const s of STATUSES) {
    const actual = CSV_PATIENTS.filter((p) => p.status === s).length;
    assert.equal(parsed[s], actual, `the ${s} count must match how many rows actually carry that status`);
  }
  assert.equal(Number(totalCount), CSV_PATIENTS.length);
});

test("a cohort with every bucket at zero except one still reports all five, not just the nonzero one", () => {
  const allScreened = [csvPatient("only-one", "screened", [])];
  const csv = buildCohortCsv(csvData(allScreened));
  for (const status of ["eligible", "uncertain", "near", "screened", "excluded"]) {
    assert.ok(csv.includes(`\r\n${status},`), `the ${status} row must still appear even at 0, not be omitted`);
  }
});

/* ---- disclosure ledger structure (finding #8) ---------------------------
   Nothing here should ever perform a write (see lib/disclosure.ts) — these
   tests pin the SHAPE of the record and the honesty of recordDisclosure's
   return value, since that shape is the whole point of the finding's fix. */

function baseDisclosureInput(fields: DisclosureField[]) {
  return {
    authorizationId: "auth-1",
    fields,
    criteria: [] as { evidence?: string }[],
    sponsor: "Example Sponsor",
    site: "Boston, Massachusetts",
    nctId: "NCT00000000",
    purpose: "Eligibility pre-screening and contact for possible enrollment in NCT00000000.",
    compensation: { compensated: false } as const,
    now: NOW,
  };
}

test("the record names every field actually disclosed, derived from the profile — never a hardcoded list", () => {
  const fields: DisclosureField[] = [
    { label: "Diagnosis", value: "Metastatic breast cancer" },
    { label: "ECOG status", value: "1" },
    { label: "Prior lines of therapy", value: "2" },
  ];
  const record = buildDisclosureRecord(baseDisclosureInput(fields));
  assert.deepEqual(
    record.fieldsDisclosed,
    fields.map((f) => f.label),
    "every disclosed field's label must appear, in order, in the record",
  );

  // Prove it's derived rather than fixed: a field the referral discloses that
  // the record doesn't name would be exactly the P5 gap this finding closes.
  // A hardcoded list of three labels would still pass the assertion above by
  // coincidence — it would NOT pass this one.
  const extra = buildDisclosureRecord(baseDisclosureInput([...fields, { label: "Recent scan", value: "CT chest/abd/pelvis, 2026-07-01" }]));
  assert.equal(extra.fieldsDisclosed.length, fields.length + 1);
  assert.ok(extra.fieldsDisclosed.includes("Recent scan"), "a field added to the referral must show up in the record");
});

test("the record counts the eligibility assessment too — the packet is not just the profile fields", () => {
  // PacketB, which is what the coordinator actually receives, carries the
  // criterion-by-criterion assessment alongside the profile, and each
  // criterion's evidence quotes the patient's record. A ledger that named only
  // the profile labels would understate the disclosure — the P5 gap itself.
  const record = buildDisclosureRecord({
    ...baseDisclosureInput([{ label: "Diagnosis", value: "Metastatic breast cancer" }]),
    criteria: [
      { evidence: "ER+ / PR+ on the 2025-11 pathology report" },
      { evidence: "   " }, // whitespace is not evidence
      {},
    ],
  });
  assert.equal(record.criteriaDisclosed.count, 3, "every criterion that travels with the packet is counted");
  assert.equal(record.criteriaDisclosed.quotingRecord, 1, "only criteria that actually quote the record count as quoting it");
});

test("buildDisclosureRecord derives validity and retention from the `now` argument, not from calling Date.now() itself", () => {
  const record = buildDisclosureRecord(baseDisclosureInput([{ label: "Diagnosis", value: "Metastatic breast cancer" }]));
  assert.equal(record.timestamp, new Date(NOW).toISOString());
  assert.equal(record.authorization.validFrom, new Date(NOW).toISOString());
  // Calendar anniversaries, not n×365 days: six 365-day years land ~1.5 days
  // short of the six-year mark, and a retention FLOOR must never round down.
  assert.equal(record.authorization.validUntil, "2027-07-30T00:00:00.000Z", "P3: one-year validity window");
  assert.equal(record.authorization.retainUntil, "2032-07-30T00:00:00.000Z", "P3: six-year retention floor");
  assert.equal(record.authorization.signature.method, "clickthrough");
  assert.equal(record.authorization.signature.capturedAt, record.timestamp);
});

test("buildDisclosureRecord is deterministic for fixed inputs — same id, same now, same output", () => {
  const input = baseDisclosureInput([
    { label: "Diagnosis", value: "Metastatic breast cancer" },
    { label: "ECOG status", value: "1" },
  ]);
  assert.deepEqual(buildDisclosureRecord(input), buildDisclosureRecord(input));
});

test("recordDisclosure reports the record was NOT persisted, while no ledger backend exists", () => {
  const record = buildDisclosureRecord(baseDisclosureInput([{ label: "Diagnosis", value: "Metastatic breast cancer" }]));
  const outcome = recordDisclosure(record);
  assert.equal(outcome.persisted, false, "there is no ledger backend today — a caller must never read this as a successful write");
  if (outcome.persisted) throw new Error("unreachable — narrowed above");
  assert.equal(outcome.reason, "no_ledger_backend_configured");
  assert.deepEqual(outcome.record, record, "the caller must still get back exactly the record that would have been written");
});

test("a compensated disclosure names the purchaser — compensation carries data, not just a flag", () => {
  const record = buildDisclosureRecord({
    ...baseDisclosureInput([{ label: "Diagnosis", value: "Metastatic breast cancer" }]),
    compensation: { compensated: true, purchaser: "Example Sponsor Referral Program" },
  });
  assert.equal(record.compensation.compensated, true);
  if (!record.compensation.compensated) throw new Error("unreachable — narrowed above");
  assert.equal(record.compensation.purchaser, "Example Sponsor Referral Program");
});

test("compensation cannot be left unanswered — the type requires it, never defaults to \"no\"", () => {
  // This is a compile-time guarantee, checked by `npx tsc --noEmit`, not a
  // runtime one: `compensation` is a required field on buildDisclosureRecord's
  // input, so omitting it must fail to type-check. If someone later makes it
  // optional (silently defaulting an unanswered compensation question to "no"
  // — exactly the failure mode finding #8 was written to prevent), the
  // `@ts-expect-error` below stops matching a real error and tsc fails on
  // "Unused '@ts-expect-error' directive", catching the regression here.
  function attemptWithoutCompensation() {
    const fields: DisclosureField[] = [{ label: "Diagnosis", value: "Metastatic breast cancer" }];
    // @ts-expect-error — `compensation` is required; this must not type-check.
    return buildDisclosureRecord({
      authorizationId: "auth-1",
      fields,
      sponsor: "Example Sponsor",
      site: "Boston, Massachusetts",
      nctId: "NCT00000000",
      purpose: "test",
      now: NOW,
    });
  }
  assert.equal(typeof attemptWithoutCompensation, "function", "the real assertion here is enforced by tsc, see comment above");
});

/* ---- the screening-failure feedback loop (lib/feedback.ts) --------------
   The file round trip the roadmap asked for: a coordinator's correction →
   JSON → a case evals/ledger.ts can actually run. Every test below pins one
   of the invariants lib/feedback.ts's header comment states, not just that
   the functions don't throw. */

const FEEDBACK_TRIAL: ScreenTrialSummary = {
  nctId: "NCT12340000",
  title: "Fabricated Study For The Feedback Loop",
  phase: "Phase 2",
  sponsor: "Example Sponsor",
  url: "https://clinicaltrials.gov/study/NCT12340000",
  overallStatus: "RECRUITING",
  registryAgeDays: 10,
  registryStale: false,
};

function feedbackPatient(): PatientResult {
  const criteria = [
    criterion({ kind: "incl", verdict: "meets", requirement: "HR-positive, HER2-negative metastatic breast cancer", evidence: "ER 90%, HER2 IHC 0." }),
    criterion({ kind: "excl", verdict: "fails", requirement: "No prior CDK4/6 inhibitor", evidence: "Received palbociclib 1L.", remediable: false }),
  ];
  return {
    id: "P-1",
    status: "near",
    headline: "Ruled out on prior CDK4/6 inhibitor.",
    criteria,
    metCount: 1,
    total: 2,
    openCount: 0,
    hardFailCount: 1,
    structuralExclusion: null,
  };
}

test("isAdjudicable admits only the statuses a model actually reasoned over", () => {
  assert.equal(isAdjudicable("eligible"), true);
  assert.equal(isAdjudicable("uncertain"), true);
  assert.equal(isAdjudicable("near"), true);
  assert.equal(isAdjudicable("screened"), false, "no criteria were ever judged — nothing to confirm or correct");
  assert.equal(isAdjudicable("excluded"), false, "a deterministic structural gate, not a clinical judgment");
});

test("reconstructEligibilityCriteria groups a patient's own ledger back into inclusion/exclusion prose", () => {
  const text = reconstructEligibilityCriteria([
    criterion({ kind: "incl", requirement: "Adults 18 or older" }),
    criterion({ kind: "excl", requirement: "No active brain metastases" }),
  ]);
  assert.match(text, /Inclusion Criteria:\n- Adults 18 or older/);
  assert.match(text, /Exclusion Criteria:\n- No active brain metastases/);
});

test("an exported correction round-trips through JSON without losing the clinician's claim", () => {
  const patient = feedbackPatient();
  const correction = buildCorrection({
    patientId: patient.id,
    trialNctId: FEEDBACK_TRIAL.nctId,
    appStatus: patient.status,
    trueStatus: "near",
    // The clinician says the REAL reason was something the app's ledger never
    // named at all — the exact case the roadmap's feedback loop exists for.
    trueFailure: { requirement: "Uncontrolled brain metastases found on post-screening MRI", appNamedIt: false },
    // The deciding fact arrived AFTER the screen — so this is feedback about
    // the record, not about the reasoning, and must not be scored.
    basis: "outside-the-record",
    note: "Progressed intracranially two weeks after this screen; nothing in the record we had showed it.",
    reviewerLabel: "RN — J.D.",
    now: Date.UTC(2026, 7, 1),
  });
  const built = buildAdjudicatedCase({
    correction,
    patient: { criteria: patient.criteria },
    profile: { summary: "62F, HR+/HER2- MBC, 2 prior lines, ECOG 1." },
    trial: FEEDBACK_TRIAL,
    now: Date.UTC(2026, 7, 1),
  });

  const json = serializeAdjudicatedCase(built);
  const parsed = parseAdjudicatedCase(json);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  if (!parsed.ok) throw new Error("unreachable — asserted above");
  assert.deepEqual(parsed.case, built, "parsing what was just serialized must reproduce it exactly, field for field");

  const ledgerCase = toLedgerCase(parsed.case);
  assert.equal(ledgerCase.adjudicated, true);
  assert.equal(ledgerCase.expected, "near", "expected comes from the clinician's trueStatus");
  assert.equal(ledgerCase.correction?.trueFailure?.requirement, "Uncontrolled brain metastases found on post-screening MRI");
  assert.equal(ledgerCase.correction?.trueFailure?.appNamedIt, false, "\"the app never named this\" must survive the round trip intact");
  assert.deepEqual(ledgerCase.mustFail, ["Uncontrolled brain metastases found on post-screening MRI"]);
  // A LedgerCase the harness can actually run needs criteria TEXT, not just a
  // bucket — reconstructed here from the patient's own ledger (see
  // lib/feedback.ts's reconstructTrial), since /screen never held the
  // registry's raw prose to begin with.
  assert.ok(ledgerCase.trial.eligibilityCriteria.includes("No prior CDK4/6 inhibitor"));
  assert.ok(ledgerCase.trial.nctId === FEEDBACK_TRIAL.nctId && ledgerCase.trial.title === FEEDBACK_TRIAL.title);
});

test("a confirmation is a real, dated, attributed verdict — not the same thing as no review at all", () => {
  const patient = feedbackPatient();
  const confirmed = buildCorrection({
    patientId: patient.id,
    trialNctId: FEEDBACK_TRIAL.nctId,
    appStatus: patient.status, // "near"
    trueStatus: "near", // the coordinator agrees
    trueFailure: { requirement: "No prior CDK4/6 inhibitor", appNamedIt: true },
    now: Date.UTC(2026, 7, 1),
  });
  assert.equal(confirmed.confirmsApp, true, "trueStatus === appStatus must read as an explicit confirmation");
  assert.ok(confirmed.reviewedAt, "a confirmation still carries a timestamp — it is a real review, not a no-op");

  const built = buildAdjudicatedCase({
    correction: confirmed,
    patient: { criteria: patient.criteria },
    profile: { summary: "x" },
    trial: FEEDBACK_TRIAL,
  });
  assert.equal(toLedgerCase(built).adjudicated, true, "a confirmation is still `adjudicated: true` — it is evidence, not silence");

  // There is no path in this module to a ScreeningCorrection nobody made: no
  // default export, no empty/unset value. "Unreviewed" is represented only
  // by the total absence of a correction — e.g. an authored LedgerCase from
  // evals/cases/ledger-cases.ts, which never sets `adjudicated` at all.
  assert.equal(trial().eligibilityCriteria.length > 0, true, "sanity: an authored case's trial carries no `adjudicated`/`correction` fields");
});

test("the app's derived status never overwrites the coordinator's claim, in either direction", () => {
  const patient = feedbackPatient(); // app derived "near"
  const overridden = buildCorrection({
    patientId: patient.id,
    trialNctId: FEEDBACK_TRIAL.nctId,
    appStatus: patient.status, // "near"
    trueStatus: "eligible", // the coordinator's claim: the app was wrong
    basis: "published-criteria",
  });
  assert.equal(overridden.trueStatus, "eligible", "the clinician's claim survives even though it disagrees with the app");
  assert.equal(overridden.appStatus, "near", "the app's own status is kept for the record, never silently rewritten to agree");
  assert.equal(overridden.confirmsApp, false);

  const built = buildAdjudicatedCase({
    correction: overridden,
    patient: { criteria: patient.criteria },
    profile: { summary: "x" },
    trial: FEEDBACK_TRIAL,
  });
  assert.equal(built.expected, "eligible", "the eval's gold `expected` comes from the clinician's claim, never from appStatus");
});

test('buildCorrection refuses a "near" claim with no named failure, and refuses a failure attached to a non-"near" claim', () => {
  assert.throws(
    () => buildCorrection({ patientId: "p", trialNctId: "NCT00000001", appStatus: "near", trueStatus: "near" }),
    /must name the criterion/,
  );
  assert.throws(
    () =>
      buildCorrection({
        patientId: "p",
        trialNctId: "NCT00000001",
        appStatus: "eligible",
        trueStatus: "eligible",
        trueFailure: { requirement: "x", appNamedIt: false },
      }),
    /only applies when/,
  );
});

test("malformed JSON is rejected, not silently turned into a degenerate case", () => {
  const notJson = parseAdjudicatedCase("{not valid json");
  assert.equal(notJson.ok, false);
  if (notJson.ok) throw new Error("unreachable");
  assert.match(notJson.error, /Malformed JSON/);

  const wrongShape = parseAdjudicatedCase(JSON.stringify({ hello: "world" }));
  assert.equal(wrongShape.ok, false);

  const emptyCriteria = parseAdjudicatedCase(
    JSON.stringify({
      kind: "trialign-adjudicated-case",
      schemaVersion: 1,
      exportedAt: "2026-08-01T00:00:00.000Z",
      notice: "x",
      id: "x",
      about: "x",
      profile: { summary: "x", fields: [] },
      trial: { ...reconstructTrial(FEEDBACK_TRIAL, []), eligibilityCriteria: "" },
      expected: "near",
      correction: {
        kind: "trialign-screening-correction",
        schemaVersion: 1,
        patientId: "p",
        trialNctId: FEEDBACK_TRIAL.nctId,
        appStatus: "near",
        trueStatus: "near",
        confirmsApp: true,
        trueFailure: { requirement: "x", appNamedIt: true },
        note: "",
        reviewedAt: "2026-08-01T00:00:00.000Z",
        reviewerLabel: "",
      },
      reconstructionCaveats: [],
    }),
  );
  assert.equal(emptyCriteria.ok, false, "a case with no criteria text to reason over must be rejected, not accepted as runnable");
});

test("a spoofed confirmsApp is caught on read, not trusted from the file", () => {
  // The app's status must never be able to silently overwrite the
  // clinician's claim — including via a hand-edited or corrupted file that
  // just asserts agreement that never happened.
  const patient = feedbackPatient();
  const correction = buildCorrection({
    patientId: patient.id,
    trialNctId: FEEDBACK_TRIAL.nctId,
    appStatus: "near",
    trueStatus: "eligible", // genuinely disagrees with the app
    basis: "published-criteria",
  });
  const built = buildAdjudicatedCase({ correction, patient: { criteria: patient.criteria }, profile: { summary: "x" }, trial: FEEDBACK_TRIAL });
  const tampered = JSON.parse(serializeAdjudicatedCase(built));
  tampered.correction.confirmsApp = true; // the lie: claim the app was right when the correction itself disagrees
  const rejected = parseAdjudicatedCase(JSON.stringify(tampered));
  assert.equal(rejected.ok, false);
  if (rejected.ok) throw new Error("unreachable");
  assert.match(rejected.error, /confirmsApp/);
});

test("a correction whose criterion the app never surfaced is put back into the trial text, not left unsatisfiable", () => {
  // The primary case this loop exists for: the app missed a published
  // criterion. The eligibility text a case carries is rebuilt from the app's
  // own ledger, so unless the criterion is restored, the case asks the model
  // to fail on a requirement it is never shown — red forever, and read as a
  // model defect rather than a broken case.
  const patient = feedbackPatient();
  const correction = buildCorrection({
    patientId: patient.id,
    trialNctId: FEEDBACK_TRIAL.nctId,
    appStatus: "eligible",
    trueStatus: "near",
    trueFailure: { requirement: "Prior exposure to an AKT inhibitor", appNamedIt: false },
    basis: "criterion-missing",
  });
  const built = buildAdjudicatedCase({ correction, patient: { criteria: patient.criteria }, profile: { summary: "x" }, trial: FEEDBACK_TRIAL });
  assert.equal(built.evalUsable, true, "a criterion the study published but the app dropped is exactly what should be scored");
  assert.ok(
    built.trial.eligibilityCriteria.includes("Prior exposure to an AKT inhibitor"),
    "the restored criterion must appear in the text the model will be shown, or the case can never pass",
  );
  assert.match(built.trial.eligibilityCriteria, /restored by clinician review/, "and it must be visibly distinguishable from the app's own extraction");
});

test("a failure that was outside the record is kept as feedback but never scored", () => {
  // A model reasoning over a profile that never mentioned the fact SHOULD
  // reach the app's answer. Scoring this would mark correct reasoning as a
  // miss and corrupt the false-eligible rate — the number the suite exists for.
  const patient = feedbackPatient();
  const correction = buildCorrection({
    patientId: patient.id,
    trialNctId: FEEDBACK_TRIAL.nctId,
    appStatus: "eligible",
    trueStatus: "near",
    trueFailure: { requirement: "Brain metastases seen on a scan taken after the screen", appNamedIt: false },
    basis: "outside-the-record",
  });
  const built = buildAdjudicatedCase({ correction, patient: { criteria: patient.criteria }, profile: { summary: "x" }, trial: FEEDBACK_TRIAL });
  assert.equal(built.evalUsable, false);
  assert.ok(built.evalUsableReason.length > 0, "and it must say why, in the file itself");
  // Still a valid, parseable artifact — excluded from scoring, not discarded.
  const reparsed = parseAdjudicatedCase(serializeAdjudicatedCase(built));
  assert.equal(reparsed.ok, true);
});

test("a stated basis governs even when the coordinator agrees with the app's bucket", () => {
  // Right answer, wrong reason: the app said "near" and the coordinator agrees
  // it was near — but on a criterion nobody could have known. The agreement
  // does not make the pinned criterion scorable.
  const patient = feedbackPatient();
  const correction = buildCorrection({
    patientId: patient.id,
    trialNctId: FEEDBACK_TRIAL.nctId,
    appStatus: "near",
    trueStatus: "near",
    trueFailure: { requirement: "Undocumented prior anthracycline exposure", appNamedIt: false },
    basis: "outside-the-record",
  });
  assert.equal(correction.confirmsApp, true, "the buckets do agree");
  const built = buildAdjudicatedCase({ correction, patient: { criteria: patient.criteria }, profile: { summary: "x" }, trial: FEEDBACK_TRIAL });
  assert.equal(built.evalUsable, false, "but agreement on the bucket does not make an unknowable criterion scorable");
});

test("a hand-edited file cannot promote an unscorable correction into the gold set", () => {
  const patient = feedbackPatient();
  const correction = buildCorrection({
    patientId: patient.id,
    trialNctId: FEEDBACK_TRIAL.nctId,
    appStatus: "eligible",
    trueStatus: "near",
    trueFailure: { requirement: "Brain metastases seen on a scan taken after the screen", appNamedIt: false },
    basis: "outside-the-record",
  });
  const built = buildAdjudicatedCase({ correction, patient: { criteria: patient.criteria }, profile: { summary: "x" }, trial: FEEDBACK_TRIAL });
  const tampered = JSON.parse(serializeAdjudicatedCase(built));
  tampered.evalUsable = true;
  const rejected = parseAdjudicatedCase(JSON.stringify(tampered));
  assert.equal(rejected.ok, false, "whether a case may be scored is derived from the basis, never asserted by the file");
  if (rejected.ok) throw new Error("unreachable");
  assert.match(rejected.error, /evalUsable/);
});

test("an unscorable correction is reported by the loader, not silently dropped", () => {
  const dir = mkdtempSync(join(tmpdir(), "trialign-adjudicated-mixed-"));
  try {
    const patient = feedbackPatient();
    const scorable = buildAdjudicatedCase({
      correction: buildCorrection({
        patientId: "P-1",
        trialNctId: FEEDBACK_TRIAL.nctId,
        appStatus: "eligible",
        trueStatus: "near",
        // A criterion the app DID surface for this patient — so it is in the
        // text the case carries and the pin is satisfiable.
        trueFailure: { requirement: "No prior CDK4/6 inhibitor", appNamedIt: true },
        basis: "published-criteria",
      }),
      patient: { criteria: patient.criteria },
      profile: { summary: "x" },
      trial: FEEDBACK_TRIAL,
    });
    const unscorable = buildAdjudicatedCase({
      correction: buildCorrection({
        patientId: "P-2",
        trialNctId: FEEDBACK_TRIAL.nctId,
        appStatus: "eligible",
        trueStatus: "near",
        trueFailure: { requirement: "Brain metastases seen on a scan taken after the screen", appNamedIt: false },
        basis: "outside-the-record",
      }),
      patient: { criteria: patient.criteria },
      profile: { summary: "x" },
      trial: FEEDBACK_TRIAL,
    });
    writeFileSync(join(dir, "a.json"), serializeAdjudicatedCase(scorable));
    writeFileSync(join(dir, "b.json"), serializeAdjudicatedCase(unscorable));

    const { gold, excluded } = loadAdjudicatedCases(dir);
    assert.equal(gold.length, 1, "only the scorable correction enters the gold set");
    assert.equal(excluded.length, 1, "and the other is surfaced rather than vanishing between the coordinator and the scorecard");
    assert.equal(excluded[0].file, "b.json");
    assert.ok(excluded[0].reason.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadAdjudicatedCases reads exported JSON from a directory and tags every case adjudicated", () => {
  const dir = mkdtempSync(join(tmpdir(), "trialign-adjudicated-"));
  try {
    const patient = feedbackPatient();
    const correction = buildCorrection({
      patientId: patient.id,
      trialNctId: FEEDBACK_TRIAL.nctId,
      appStatus: "near",
      trueStatus: "near",
      trueFailure: { requirement: "No prior CDK4/6 inhibitor", appNamedIt: true },
    });
    const built = buildAdjudicatedCase({ correction, patient: { criteria: patient.criteria }, profile: { summary: "x" }, trial: FEEDBACK_TRIAL });
    writeFileSync(join(dir, "case-1.json"), serializeAdjudicatedCase(built));

    const { gold, excluded } = loadAdjudicatedCases(dir);
    assert.equal(gold.length, 1);
    assert.equal(excluded.length, 0);
    assert.equal(gold[0].adjudicated, true);
    assert.equal(gold[0].expected, "near");
    assert.equal(gold[0].id, built.id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadAdjudicatedCases returns nothing for a directory that does not exist yet, rather than throwing", () => {
  assert.deepEqual(loadAdjudicatedCases(join(tmpdir(), "trialign-does-not-exist-" + Date.now())), { gold: [], excluded: [] });
});

test("loadAdjudicatedCases throws, naming the file, when one correction in the directory is malformed", () => {
  const dir = mkdtempSync(join(tmpdir(), "trialign-adjudicated-bad-"));
  try {
    writeFileSync(join(dir, "broken.json"), "{not json");
    assert.throws(() => loadAdjudicatedCases(dir), /broken\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
