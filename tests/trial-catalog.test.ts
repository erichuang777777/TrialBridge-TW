import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeClinicalTrialsGovStudy } from "../lib/trials/adapters/clinicalTrialsGov.ts";
import { normalizeTfdaRecord } from "../lib/trials/adapters/tfda.ts";
import { getTrialIndexAccessState, searchTrialCatalog, tfdaLiveFallbackEnabled } from "../lib/trials/index/catalog.ts";
import { LibsqlTrialIndexStore } from "../lib/trials/index/libsql.ts";
import { registrySourceTimeoutMs, resolveTrialSearchDeadlineMs } from "../lib/trials/reliability.ts";
import type { TrialRegistryAdapter } from "../lib/trials/types.ts";
import { ctgovFixture, tfdaFixture } from "./fixtures/registry.ts";

const timestamp = "2026-09-03T00:00:00.000Z";

function fakeAdapter(registry: "TFDA" | "ClinicalTrials.gov", calls: string[]): TrialRegistryAdapter {
  return {
    registry,
    async search() {
      calls.push(registry);
      const trials = registry === "TFDA" ? [normalizeTfdaRecord(tfdaFixture, timestamp)] : [normalizeClinicalTrialsGovStudy(ctgovFixture, timestamp)];
      return { registry, trials, retrievedAt: timestamp, dataState: { mode: "live" as const, loadedAt: timestamp } };
    },
  } as unknown as TrialRegistryAdapter;
}

async function ctgovOnlyStore() {
  const directory = await mkdtemp(path.join(tmpdir(), "trialbridge-catalog-"));
  const store = new LibsqlTrialIndexStore({ url: `file:${path.join(directory, "index.db")}` });
  await store.markSyncing("ClinicalTrials.gov", timestamp);
  await store.replaceSource({ registry: "ClinicalTrials.gov", trials: [normalizeClinicalTrialsGovStudy(ctgovFixture, timestamp)], startedAt: timestamp, finishedAt: timestamp, durationMs: 1 });
  return { directory, store };
}

test("catalog serves synchronized sources from the index and only the missing source live", async () => {
  const { directory, store } = await ctgovOnlyStore();
  const calls: string[] = [];
  try {
    const result = await searchTrialCatalog({ condition: "gastric cancer", pageSize: 5, includeNotOpen: true }, { TFDA: "胃癌", "ClinicalTrials.gov": "gastric cancer" }, {
      store,
      liveAdapterFactory: (registry) => fakeAdapter(registry, calls),
      tfdaLiveFallback: true,
    });
    assert.deepEqual(calls, ["TFDA"], "ClinicalTrials.gov is indexed, so only TFDA goes live");
    const byRegistry = Object.fromEntries(result.sources.map((source) => [source.registry, source.dataState.mode]));
    assert.deepEqual(byRegistry, { "ClinicalTrials.gov": "indexed", TFDA: "live" });
    assert.equal(result.failures.length, 0);
    assert.equal(result.trials.length, 1, "the live TFDA record merges with the indexed ctgov record");
    assert.deepEqual(result.trials[0].sources.map((source) => source.registry).sort(), ["ClinicalTrials.gov", "TFDA"]);
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("catalog reports TFDA as unavailable instead of downloading the export when live fallback is disabled", async () => {
  const { directory, store } = await ctgovOnlyStore();
  const calls: string[] = [];
  try {
    const result = await searchTrialCatalog({ condition: "gastric cancer", pageSize: 5, includeNotOpen: true }, {}, {
      store,
      liveAdapterFactory: (registry) => fakeAdapter(registry, calls),
      tfdaLiveFallback: false,
    });
    assert.deepEqual(calls, []);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].registry, "ClinicalTrials.gov");
    assert.deepEqual(result.failures.map((failure) => [failure.registry, failure.code]), [["TFDA", "SOURCE_UNAVAILABLE"]]);
    assert.match(result.failures[0].message, /live fallback is disabled/);
    assert.equal(result.trials.length, 1);
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("catalog falls back to every live source when the index is empty or unreachable", async () => {
  const calls: string[] = [];
  const broken = { health: async () => { throw new Error("fetch failed: ENOTFOUND"); } } as unknown as LibsqlTrialIndexStore;
  const result = await searchTrialCatalog({ condition: "gastric cancer", pageSize: 5, includeNotOpen: true }, {}, {
    store: broken,
    liveAdapterFactory: (registry) => fakeAdapter(registry, calls),
    tfdaLiveFallback: true,
  });
  assert.deepEqual(calls.sort(), ["ClinicalTrials.gov", "TFDA"]);
  assert.equal(result.sources.every((source) => source.dataState.mode === "live"), true);
  const { getTrialIndexAccessState } = await import("../lib/trials/index/catalog.ts");
  assert.equal(getTrialIndexAccessState().status, "unavailable");
  assert.equal(getTrialIndexAccessState().message, "index_unreachable");
});

test("catalog answers with SOURCE_TIMEOUT inside its deadline when the index hangs, without starting a live fallback", async () => {
  const calls: string[] = [];
  const hanging = { health: () => new Promise<never>(() => undefined) } as unknown as LibsqlTrialIndexStore;
  const startedAt = performance.now();
  const result = await searchTrialCatalog({ condition: "gastric cancer", pageSize: 5, includeNotOpen: true }, {}, {
    store: hanging,
    timeoutMs: 120,
    liveAdapterFactory: (registry) => fakeAdapter(registry, calls),
    tfdaLiveFallback: true,
  });
  assert.ok(performance.now() - startedAt < 2_000, "the request returns shortly after the deadline");
  assert.deepEqual(calls, [], "no live registry query starts after the budget is spent");
  assert.equal(result.sources.length, 0);
  assert.equal(result.trials.length, 0);
  assert.deepEqual(result.failures.map((failure) => [failure.registry, failure.code]).sort(), [["ClinicalTrials.gov", "SOURCE_TIMEOUT"], ["TFDA", "SOURCE_TIMEOUT"]]);
  assert.match(result.failures[0].message, /did not respond within 120 ms/);
  assert.equal(getTrialIndexAccessState().status, "unavailable");
  assert.equal(getTrialIndexAccessState().message, "index_timeout");
});

test("the search deadline defaults to the registry deadline and only accepts sane overrides", () => {
  assert.equal(resolveTrialSearchDeadlineMs({}), registrySourceTimeoutMs);
  assert.equal(resolveTrialSearchDeadlineMs({ TRIAL_SEARCH_DEADLINE_MS: "7000" }), 7_000);
  assert.equal(resolveTrialSearchDeadlineMs({ TRIAL_SEARCH_DEADLINE_MS: " 9000 " }), 9_000);
  assert.equal(resolveTrialSearchDeadlineMs({ TRIAL_SEARCH_DEADLINE_MS: "10" }), registrySourceTimeoutMs, "too short to answer anything");
  assert.equal(resolveTrialSearchDeadlineMs({ TRIAL_SEARCH_DEADLINE_MS: "abc" }), registrySourceTimeoutMs);
  assert.equal(resolveTrialSearchDeadlineMs({ TRIAL_SEARCH_DEADLINE_MS: "999999" }), registrySourceTimeoutMs);
});

test("TFDA live fallback flag defaults on and accepts explicit off values", () => {
  assert.equal(tfdaLiveFallbackEnabled(undefined), true);
  assert.equal(tfdaLiveFallbackEnabled("true"), true);
  assert.equal(tfdaLiveFallbackEnabled("false"), false);
  assert.equal(tfdaLiveFallbackEnabled("0"), false);
  assert.equal(tfdaLiveFallbackEnabled("OFF"), false);
});
