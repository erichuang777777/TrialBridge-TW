import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeClinicalTrialsGovStudy } from "../lib/trials/adapters/clinicalTrialsGov.ts";
import { normalizeTfdaRecord } from "../lib/trials/adapters/tfda.ts";
import { LibsqlTrialIndexStore, maxCandidateWindow, selectPayloadRowIds } from "../lib/trials/index/libsql.ts";
import { resolveTrialIndexProfile, trialIndexProfileSqlPredicate, trialMatchesIndexProfile } from "../lib/trials/index/profile.ts";
import { createTrialIndexStore, resolveTrialIndexBackend } from "../lib/trials/index/store.ts";
import { ctgovFixture, tfdaFixture } from "./fixtures/registry.ts";

const timestamp = "2026-09-03T00:00:00.000Z";

async function temporaryStore(options: { readOnly?: boolean } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "trialbridge-libsql-"));
  const file = path.join(directory, "trial-index.db");
  const store = new LibsqlTrialIndexStore({ url: `file:${file}`, ...options });
  await store.initialize();
  return { directory, file, store };
}

test("libsql store stores, deduplicates, searches with CJK bigrams, and reports health from source bookkeeping", async () => {
  const { directory, store } = await temporaryStore();
  try {
    assert.equal((await store.health()).status, "empty");
    for (const [registry, trials, sourceVersion] of [
      ["TFDA", [normalizeTfdaRecord(tfdaFixture, timestamp)], "2026/08/01"],
      ["ClinicalTrials.gov", [normalizeClinicalTrialsGovStudy(ctgovFixture, timestamp)], "2026-09-03T00:00:00Z"],
    ] as const) {
      await store.markSyncing(registry, timestamp);
      await store.replaceSource({ registry, trials: [...trials], sourceVersion, startedAt: timestamp, finishedAt: timestamp, durationMs: 20 });
    }
    const health = await store.health();
    assert.equal(health.backend, "libsql");
    assert.equal(health.status, "ready");
    assert.equal(health.totalRecords, 2);
    assert.equal(health.containsPatientData, false);
    const bilingual = await store.search({ condition: "gastric cancer", terms: ["gastric cancer", "胃癌"], pageSize: 20, includeNotOpen: true });
    assert.equal(bilingual.trials.length, 1, "shared identifiers merge the TFDA and ctgov records");
    assert.deepEqual(bilingual.trials[0].sources.map((source) => source.registry).sort(), ["ClinicalTrials.gov", "TFDA"]);
    const chinese = await store.search({ condition: "胃癌", terms: ["胃癌"], pageSize: 20, includeNotOpen: true });
    assert.equal(chinese.trials.length, 1, "CJK bigram tokens must reach the FTS index");
    assert.equal(chinese.trials[0].sources.some((source) => source.registry === "TFDA"), true);
    assert.equal((await store.getByCanonicalId("ctgov:nct00000001"))?.title.includes("Gastric"), true);
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("libsql staging is atomic and a failed run preserves the last good index", async () => {
  const { directory, store } = await temporaryStore();
  try {
    const original = normalizeClinicalTrialsGovStudy(ctgovFixture, timestamp);
    await store.markSyncing("ClinicalTrials.gov", timestamp);
    await store.replaceSource({ registry: "ClinicalTrials.gov", trials: [original], startedAt: timestamp, finishedAt: timestamp, durationMs: 1 });

    const stagedStudy = structuredClone(ctgovFixture);
    stagedStudy.protocolSection.identificationModule.nctId = "NCT00000002";
    const staged = normalizeClinicalTrialsGovStudy(stagedStudy, "2026-09-03T01:00:00.000Z");
    const failedRun = await store.markSyncing("ClinicalTrials.gov", "2026-09-03T01:00:00.000Z");
    await store.stageSourceBatch("ClinicalTrials.gov", failedRun, [staged], "2026-09-03T01:00:00.000Z");
    assert.equal(await store.getByCanonicalId(staged.canonicalId), undefined);
    await store.markFailure("ClinicalTrials.gov", failedRun, timestamp, "2026-09-03T01:01:00.000Z", 60_000, "synthetic interruption");
    assert.ok(await store.getByCanonicalId(original.canonicalId));
    assert.equal((await store.health()).status, "degraded");

    const successfulStartedAt = new Date(Date.now() - 1_000).toISOString();
    const successfulRun = await store.markSyncing("ClinicalTrials.gov", successfulStartedAt);
    await store.stageSourceBatch("ClinicalTrials.gov", successfulRun, [normalizeClinicalTrialsGovStudy(ctgovFixture, "2026-09-03T02:00:00.000Z")], "2026-09-03T02:00:00.000Z");
    const state = await store.commitStagedSource({ registry: "ClinicalTrials.gov", runId: successfulRun, receivedCount: 1, startedAt: successfulStartedAt });
    assert.equal(state.changedCount, 0);
    assert.equal(state.recordCount, 1);

    const incrementalStartedAt = new Date(Date.now() - 1_000).toISOString();
    const incrementalRun = await store.markSyncing("ClinicalTrials.gov", incrementalStartedAt);
    await store.stageSourceBatch("ClinicalTrials.gov", incrementalRun, [staged], "2026-09-03T03:00:00.000Z");
    const incremental = await store.commitStagedIncrementalSource({ registry: "ClinicalTrials.gov", runId: incrementalRun, receivedCount: 1, startedAt: incrementalStartedAt });
    assert.equal(incremental.recordCount, 2);
    assert.ok(await store.getByCanonicalId(staged.canonicalId));
    assert.equal((await store.health()).totalRecords, 2);
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("libsql search pushes the recruitment filter into SQL so closed Taiwan records cannot exhaust the window", async () => {
  const { directory, store } = await temporaryStore();
  try {
    const trials = Array.from({ length: 12 }, (_, index) => {
      const study = structuredClone(ctgovFixture);
      study.protocolSection.identificationModule.nctId = `NCT0000${String(index + 10).padStart(4, "0")}`;
      // Distinct sponsor identifiers keep the clones from being deduplicated into one trial.
      study.protocolSection.identificationModule.orgStudyIdInfo = { id: `ORG-${index}` };
      study.protocolSection.identificationModule.secondaryIdInfos = [{ id: `SEC-${index}` }];
      study.protocolSection.statusModule.overallStatus = index === 11 ? "RECRUITING" : "COMPLETED";
      return normalizeClinicalTrialsGovStudy(study, timestamp);
    });
    await store.markSyncing("ClinicalTrials.gov", timestamp);
    await store.replaceSource({ registry: "ClinicalTrials.gov", trials, startedAt: timestamp, finishedAt: timestamp, durationMs: 1 });
    const open = await store.search({ condition: "gastric cancer", terms: ["gastric cancer"], pageSize: 2, includeNotOpen: false });
    assert.equal(open.trials.length, 1);
    assert.equal(open.trials[0].recruitment.acceptingNewParticipants, true);
    const all = await store.search({ condition: "gastric cancer", terms: ["gastric cancer"], pageSize: 2, includeNotOpen: true });
    assert.equal(all.trials.length, 2);
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("libsql search ranks a wide identifier window but only fetches the payloads that can fill the page", async () => {
  const { directory, store } = await temporaryStore();
  try {
    // 30 distinct worldwide records, then one Taiwan record inserted last so a
    // window limited to `pageSize` rows (ordered by recency) would miss it.
    const trials = Array.from({ length: 30 }, (_, index) => {
      const study = structuredClone(ctgovFixture);
      study.protocolSection.identificationModule.nctId = `NCT0000${String(index + 100).padStart(4, "0")}`;
      study.protocolSection.identificationModule.orgStudyIdInfo = { id: `ORG-W-${index}` };
      study.protocolSection.identificationModule.secondaryIdInfos = [{ id: `SEC-W-${index}` }];
      study.protocolSection.statusModule.overallStatus = "RECRUITING";
      return normalizeClinicalTrialsGovStudy(study, timestamp);
    });
    await store.markSyncing("ClinicalTrials.gov", timestamp);
    await store.replaceSource({ registry: "ClinicalTrials.gov", trials, startedAt: timestamp, finishedAt: timestamp, durationMs: 1 });
    await store.markSyncing("TFDA", timestamp);
    await store.replaceSource({ registry: "TFDA", trials: [normalizeTfdaRecord(tfdaFixture, timestamp)], startedAt: timestamp, finishedAt: timestamp, durationMs: 1 });

    const page = await store.search({ condition: "gastric cancer", terms: ["gastric cancer", "胃癌"], pageSize: 5, includeNotOpen: true });
    assert.equal(page.trials.length, 5, "the page is filled");
    assert.equal(page.trials[0].regionTier, "taiwan", "Taiwan-first ranking survives the bounded payload fetch");
    const wide = await store.search({ condition: "gastric cancer", terms: ["gastric cancer"], pageSize: 20, includeNotOpen: true });
    assert.equal(wide.trials.length, 20, "twenty distinct records fill a twenty-record page");
    assert.equal(new Set(wide.trials.map((trial) => trial.canonicalId)).size, 20);
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("selectPayloadRowIds keeps every row of the leading canonical ids plus a bounded margin", () => {
  const candidates = [
    { rowid: 1, canonicalId: "a" },
    { rowid: 2, canonicalId: "a" },
    { rowid: 3, canonicalId: "b" },
    { rowid: 4, canonicalId: "c" },
    { rowid: 5, canonicalId: "d" },
    { rowid: 6, canonicalId: "e" },
    { rowid: 7, canonicalId: "a" },
  ];
  // pageSize 2 → budget 3 canonical ids (a, b, c); every "a" row is kept.
  assert.deepEqual(selectPayloadRowIds(candidates, 2), [1, 2, 3, 4, 7]);
  assert.deepEqual(selectPayloadRowIds([], 5), []);
  assert.equal(selectPayloadRowIds(Array.from({ length: 300 }, (_, index) => ({ rowid: index, canonicalId: String(index) })), 100).length, 110, "the margin is capped at ten extra ids");
  assert.equal(maxCandidateWindow, 200);
});

test("a read-only libsql store serves searches but refuses every write", async () => {
  const { directory, file, store } = await temporaryStore();
  const readOnly = new LibsqlTrialIndexStore({ url: `file:${file}`, readOnly: true });
  try {
    await store.markSyncing("TFDA", timestamp);
    await store.replaceSource({ registry: "TFDA", trials: [normalizeTfdaRecord(tfdaFixture, timestamp)], startedAt: timestamp, finishedAt: timestamp, durationMs: 1 });
    await store.close();
    await readOnly.initialize();
    assert.equal((await readOnly.search({ condition: "胃癌", terms: ["胃癌"], pageSize: 5, includeNotOpen: true })).trials.length, 1);
    await assert.rejects(() => readOnly.markSyncing("TFDA", timestamp), /read-only/);
  } finally { await readOnly.close(); await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("libsql store rejects unsafe URLs and concurrent initialization shares one promise", async () => {
  assert.throws(() => new LibsqlTrialIndexStore({ url: "http://example.com" }), /loopback/);
  assert.throws(() => new LibsqlTrialIndexStore({ url: "ftp://example.com" }), /URL/);
  const { directory, store } = await temporaryStore();
  try {
    await Promise.all([store.initialize(), store.initialize(), store.initialize()]);
    assert.equal((await store.health()).status, "empty");
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("store factory resolves the libsql backend lazily from the environment", async () => {
  assert.equal(resolveTrialIndexBackend({}), "sqlite");
  assert.equal(resolveTrialIndexBackend({ TRIAL_INDEX_LIBSQL_URL: "libsql://example-org.turso.io" }), "libsql");
  assert.equal(resolveTrialIndexBackend({ DATABASE_URL: "postgres://localhost/x" }), "postgres");
  assert.throws(() => resolveTrialIndexBackend({ TRIAL_INDEX_BACKEND: "mysql" }), /sqlite, libsql, or postgres/);
  assert.throws(() => createTrialIndexStore({ TRIAL_INDEX_BACKEND: "libsql" }), /TRIAL_INDEX_LIBSQL_URL/);
  const directory = await mkdtemp(path.join(tmpdir(), "trialbridge-factory-"));
  const store = createTrialIndexStore({ TRIAL_INDEX_BACKEND: "libsql", TRIAL_INDEX_LIBSQL_URL: `file:${path.join(directory, "lazy.db")}` });
  try {
    assert.equal(store.backend, "libsql");
    assert.equal((await store.health()).backend, "libsql");
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("the demo index profile keeps Taiwan and Asia records plus worldwide open records", () => {
  assert.equal(resolveTrialIndexProfile(undefined), "full");
  assert.equal(resolveTrialIndexProfile("demo"), "demo");
  assert.throws(() => resolveTrialIndexProfile("tiny"), /full or demo/);
  const recruitment = (category: "open" | "not_open") => ({ raw: category, category, acceptingNewParticipants: category === "open" });
  const taiwanClosed = { regionTier: "taiwan" as const, recruitment: recruitment("not_open") };
  const worldOpen = { regionTier: "world" as const, recruitment: recruitment("open") };
  const worldClosed = { regionTier: "world" as const, recruitment: recruitment("not_open") };
  assert.equal(trialMatchesIndexProfile(taiwanClosed, "demo"), true);
  assert.equal(trialMatchesIndexProfile(worldOpen, "demo"), true);
  assert.equal(trialMatchesIndexProfile(worldClosed, "demo"), false);
  assert.equal(trialMatchesIndexProfile(worldClosed, "full"), true);
  assert.match(trialIndexProfileSqlPredicate("demo"), /region_tier IN \('taiwan', 'asia'\) OR recruitment_category IN/);
  assert.equal(trialIndexProfileSqlPredicate("full"), "1=1");
});
