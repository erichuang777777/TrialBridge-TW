import assert from "node:assert/strict";
import test from "node:test";
import { conditionBadges, phaseLabel, publishedSiteRegion, recruitmentLabel, regionLabel, sourceScopeLabel, trialMatchesFilters, trialPhaseFilter } from "../lib/trials/presentation.ts";
import { normalizeClinicalTrialsGovStudy } from "../lib/trials/adapters/clinicalTrialsGov.ts";
import { normalizeTfdaRecord } from "../lib/trials/adapters/tfda.ts";
import { ctgovFixture, tfdaFixture } from "./fixtures/registry.ts";

const trial = normalizeClinicalTrialsGovStudy(ctgovFixture, "2026-09-02T00:00:00.000Z");

test("condition badges remove NA and collapse repeated staged cancer labels", () => {
  assert.deepEqual(conditionBadges([
    "NA",
    "Breast Cancer Stages I",
    "Breast Cancer Stages II",
    "Breast Cancer Stage III",
  ]), {
    badges: [
      { label: "Breast Cancer", kind: "condition" },
      { label: "Stage I", kind: "stage" },
      { label: "Stage II", kind: "stage" },
      { label: "Stage III", kind: "stage" },
    ],
    hiddenCount: 0,
  });
});

test("phase badges normalize registry and unicode phase notation", () => {
  assert.equal(trialPhaseFilter(trial), "phase3");
  assert.equal(trialPhaseFilter({ phases: ["Phase Ⅰ,Phase Ⅱ"] }), "phase1_2");
  assert.equal(phaseLabel("phase2_3"), "Phase 2/3");
});

test("location and recruitment labels do not imply unpublished facts", () => {
  assert.equal(regionLabel("unknown"), "Sites not published");
  assert.equal(recruitmentLabel({ recruitment: { raw: "未提供", category: "unknown", acceptingNewParticipants: false } }), "Status not published");
  assert.equal(recruitmentLabel(trial), "Recruiting");
});

test("phase, location, and recruitment filters combine deterministically", () => {
  assert.equal(trialMatchesFilters(trial, { phase: "phase3", region: "taiwan", recruitment: "open" }), true);
  assert.equal(trialMatchesFilters(trial, { phase: "phase2", region: "taiwan", recruitment: "open" }), false);
});

test("location filters use published sites rather than a registry's source scope", () => {
  const tfdaOnly = normalizeTfdaRecord(tfdaFixture, "2026-09-02T00:00:00.000Z");
  assert.equal(tfdaOnly.regionTier, "taiwan");
  assert.equal(publishedSiteRegion(tfdaOnly), "unknown");
  assert.equal(sourceScopeLabel(tfdaOnly), "TFDA · Taiwan record");
  assert.equal(trialMatchesFilters(tfdaOnly, { phase: "all", region: "taiwan", recruitment: "all" }), false);
  assert.equal(trialMatchesFilters(tfdaOnly, { phase: "all", region: "unknown", recruitment: "all" }), true);
});
