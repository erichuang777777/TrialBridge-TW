import assert from "node:assert/strict";
import test from "node:test";
import { normalizeClinicalTrialsGovStudy } from "../lib/trials/adapters/clinicalTrialsGov.ts";
import { normalizeTfdaRecord, TfdaAdapter } from "../lib/trials/adapters/tfda.ts";
import { deduplicateTrials } from "../lib/trials/dedupe.ts";
import { rankTrials } from "../lib/trials/regions.ts";
import { trialSearchRequestSchema } from "../lib/trials/schema.ts";
import { searchTrialRegistries } from "../lib/trials/search.ts";
import type { TrialRegistryAdapter } from "../lib/trials/types.ts";
import { ctgovFixture, tfdaFixture } from "./fixtures/registry.ts";

const retrievedAt = "2026-09-01T00:00:00.000Z";

test("TFDA normalization preserves source and Taiwan priority", () => {
  const trial = normalizeTfdaRecord(tfdaFixture, retrievedAt);
  assert.equal(trial.regionTier, "taiwan");
  assert.equal(trial.sources[0].registry, "TFDA");
  assert.equal(trial.recruitment.acceptingNewParticipants, true);
  assert.match(trial.title, /胃癌/);
});

test("ClinicalTrials.gov normalization retains registry facts and locations", () => {
  const trial = normalizeClinicalTrialsGovStudy(ctgovFixture, retrievedAt);
  assert.equal(trial.canonicalId, "ctgov:nct00000001");
  assert.equal(trial.regionTier, "taiwan");
  assert.deepEqual(trial.conditions, ["Gastric Cancer"]);
  assert.equal(trial.locations.length, 2);
  assert.equal(trial.sources[0].lastUpdated, "2026-08-20");
});

test("deduplication merges only explicit shared identifiers and keeps both sources", () => {
  const tfda = normalizeTfdaRecord(tfdaFixture, retrievedAt);
  const ctgov = normalizeClinicalTrialsGovStudy(ctgovFixture, retrievedAt);
  const merged = deduplicateTrials([ctgov, tfda]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].canonicalId, tfda.canonicalId);
  assert.deepEqual(merged[0].sources.map((source) => source.registry).sort(), ["ClinicalTrials.gov", "TFDA"]);

  const unrelated = { ...ctgov, identifiers: ["NCT99999999"], canonicalId: "ctgov:nct99999999" };
  assert.equal(deduplicateTrials([tfda, unrelated]).length, 2);
});

test("ranking is Taiwan then Asia then worldwide", () => {
  const base = normalizeClinicalTrialsGovStudy(ctgovFixture, retrievedAt);
  const taiwan = { ...base, canonicalId: "taiwan", regionTier: "taiwan" as const };
  const asia = { ...base, canonicalId: "asia", regionTier: "asia" as const };
  const world = { ...base, canonicalId: "world", regionTier: "world" as const };
  assert.deepEqual(rankTrials([world, taiwan, asia]).map((trial) => trial.canonicalId), ["taiwan", "asia", "world"]);
});

test("one registry failure does not erase another source", async () => {
  const healthy = new TfdaAdapter(fetch, async () => [tfdaFixture]);
  const failing: TrialRegistryAdapter = {
    registry: "ClinicalTrials.gov",
    async search() { throw new Error("private implementation detail"); },
  };
  const result = await searchTrialRegistries({ condition: "胃癌", pageSize: 10, includeNotOpen: false }, [failing, healthy]);
  assert.equal(result.trials.length, 1);
  assert.deepEqual(result.failures, [{ registry: "ClinicalTrials.gov", message: "Registry temporarily unavailable" }]);
});

test("public search request rejects raw-note fields", () => {
  const parsed = trialSearchRequestSchema.safeParse({ condition: "胃癌", rawNote: "sensitive" });
  assert.equal(parsed.success, false);
});
