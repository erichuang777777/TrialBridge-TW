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

import { derivePatientLoc, proximity, travelThreshold, travelLabel } from "../lib/geo.ts";
import { computeFactors, ageInDays, STALE_AFTER_DAYS, type GeoContext } from "../lib/factors.ts";
import { derivePatientDemographics, structuralExclusion } from "../lib/structuralGate.ts";
import { deriveStatus, hardFailCountOf, remediableFailCountOf, openCountOf, compareMatches } from "../lib/verdict.ts";
import { siteIsRecruiting } from "../lib/ctgov.ts";
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
