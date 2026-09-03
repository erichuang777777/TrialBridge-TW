import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeClinicalTrialsGovStudy, loadClinicalTrialsGovCancerTrials } from "../lib/trials/adapters/clinicalTrialsGov.ts";
import { normalizeTfdaRecord } from "../lib/trials/adapters/tfda.ts";
import { normalizeWhoTrdsRecord } from "../lib/trials/adapters/whoTrds.ts";
import { SqliteTrialIndexStore } from "../lib/trials/index/sqlite.ts";
import { revalidateIndexedTrial } from "../lib/trials/revalidation.ts";
import { inspectNciTerminology, syncNciTerminology } from "../lib/trials/terminology/nci.ts";
import { ctgovFixture, tfdaFixture } from "./fixtures/registry.ts";

const timestamp = "2026-09-03T00:00:00.000Z";

async function temporaryStore() {
  const directory = await mkdtemp(path.join(tmpdir(), "trialbridge-index-"));
  const store = new SqliteTrialIndexStore(path.join(directory, "trial-index.sqlite"));
  await store.initialize();
  return { directory, store };
}

test("persistent public index stores, deduplicates, searches, and reports source health", async () => {
  const { directory, store } = await temporaryStore();
  try {
    assert.equal((await store.health()).status, "empty");
    for (const [registry, trials, sourceVersion] of [
      ["TFDA", [normalizeTfdaRecord(tfdaFixture, timestamp)], "2026/08/01"],
      ["ClinicalTrials.gov", [normalizeClinicalTrialsGovStudy(ctgovFixture, timestamp)], "2026-09-03T00:00:00Z"],
    ] as const) {
      const startedAt = timestamp;
      await store.markSyncing(registry, startedAt);
      await store.replaceSource({ registry, trials: [...trials], sourceVersion, startedAt, finishedAt: timestamp, durationMs: 20 });
    }
    const health = await store.health();
    assert.equal(health.status, "ready");
    assert.equal(health.totalRecords, 2);
    assert.equal(health.containsPatientData, false);
    const result = await store.search({ condition: "gastric cancer", terms: ["gastric cancer", "胃癌"], pageSize: 20, includeNotOpen: true });
    assert.equal(result.trials.length, 1);
    assert.deepEqual(result.trials[0].sources.map((source) => source.registry).sort(), ["ClinicalTrials.gov", "TFDA"]);
    assert.equal((await store.getByCanonicalId("ctgov:nct00000001"))?.title.includes("Gastric"), true);
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("staging is atomic, failed runs preserve the last good index, and volatile retrieval time is ignored", async () => {
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
    assert.ok(await store.getByCanonicalId(original.canonicalId));
    assert.equal(await store.getByCanonicalId(staged.canonicalId), undefined);
    await store.markFailure("ClinicalTrials.gov", failedRun, timestamp, "2026-09-03T01:01:00.000Z", 60_000, "synthetic interruption");
    assert.ok(await store.getByCanonicalId(original.canonicalId));

    const stableRefresh = normalizeClinicalTrialsGovStudy(ctgovFixture, "2026-09-03T02:00:00.000Z");
    const successfulStartedAt = new Date(Date.now() - 1_000).toISOString();
    const successfulRun = await store.markSyncing("ClinicalTrials.gov", successfulStartedAt);
    await store.stageSourceBatch("ClinicalTrials.gov", successfulRun, [stableRefresh], "2026-09-03T02:00:00.000Z");
    const beforeCommit = Date.now();
    const state = await store.commitStagedSource({ registry: "ClinicalTrials.gov", runId: successfulRun, receivedCount: 1, startedAt: successfulStartedAt });
    assert.equal(state.changedCount, 0);
    assert.equal(state.recordCount, 1);
    assert.ok(Date.parse(state.lastSuccessAt!) >= beforeCommit);
    assert.ok(state.durationMs! >= 1_000);

    const incrementalStartedAt = new Date(Date.now() - 1_000).toISOString();
    const incrementalRun = await store.markSyncing("ClinicalTrials.gov", incrementalStartedAt);
    await store.stageSourceBatch("ClinicalTrials.gov", incrementalRun, [staged], "2026-09-03T03:00:00.000Z");
    const incremental = await store.commitStagedIncrementalSource({ registry: "ClinicalTrials.gov", runId: incrementalRun, receivedCount: 1, startedAt: incrementalStartedAt });
    assert.equal(incremental.recordCount, 2);
    assert.equal(incremental.removedCount, 0);
    assert.ok(await store.getByCanonicalId(original.canonicalId));
    assert.ok(await store.getByCanonicalId(staged.canonicalId));
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("ClinicalTrials.gov bulk loader follows pagination and reports completeness", async () => {
  let studyCalls = 0;
  const queryTerm = "AREA[LastUpdatePostDate]RANGE[2026-09-01, MAX]";
  const second = structuredClone(ctgovFixture);
  second.protocolSection.identificationModule.nctId = "NCT00000002";
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/version")) return Response.json({ dataTimestamp: "2026-09-03T14:00:00Z" });
    assert.equal(url.searchParams.get("query.term"), queryTerm);
    studyCalls += 1;
    return Response.json(studyCalls === 1
      ? { totalCount: 2, studies: [ctgovFixture], nextPageToken: "next" }
      : { studies: [second] });
  }) as typeof fetch;
  const result = await loadClinicalTrialsGovCancerTrials({ fetcher, queryTerm });
  assert.equal(result.complete, true);
  assert.equal(result.pages, 2);
  assert.equal(result.trials.length, 2);
  assert.equal(result.sourceVersion, "2026-09-03T14:00:00Z");
});

test("single-record revalidation reports public registry changes without deciding eligibility", async () => {
  const { directory, store } = await temporaryStore();
  try {
    const indexed = normalizeClinicalTrialsGovStudy(ctgovFixture, timestamp);
    await store.markSyncing("ClinicalTrials.gov", timestamp);
    await store.replaceSource({ registry: "ClinicalTrials.gov", trials: [indexed], startedAt: timestamp, finishedAt: timestamp, durationMs: 1 });
    const changed = structuredClone(ctgovFixture);
    changed.protocolSection.statusModule.overallStatus = "COMPLETED";
    changed.protocolSection.statusModule.lastUpdatePostDateStruct.date = "2026-09-03";
    const fetcher = (async () => Response.json(changed)) as typeof fetch;
    const result = await revalidateIndexedTrial(indexed.canonicalId, fetcher, undefined, store);
    assert.equal(result.status, "changed");
    assert.equal(result.changes.some((change) => change.field === "recruitment"), true);
    assert.match(result.limitation, /study team/i);
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("NCI terminology synchronization writes a versioned no-patient-data snapshot", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "trialbridge-ncit-"));
  const destination = path.join(directory, "ncit.json");
  try {
    const fetcher = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) return Response.json({ concepts: [{ code: "C4872", name: url.searchParams.get("term") ?? "Cancer", version: "26.07d" }] });
      return Response.json({ code: "C4872", name: "Cancer concept", version: "26.07d", synonyms: [{ name: "Cancer synonym" }] });
    }) as typeof fetch;
    const snapshot = await syncNciTerminology(fetcher, destination);
    assert.equal(snapshot.concepts.length, 19);
    const health = await inspectNciTerminology(destination);
    assert.equal(health.status, "ready");
    assert.equal(health.conceptCount, 19);
    assert.equal(health.version, "26.07d");
    assert.equal(health.containsPatientData, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("WHO TRDS adapter normalizes regional records through a strict public contract", () => {
  const trial = normalizeWhoTrdsRecord({ registry: "jRCT", trialId: "jRCT-001", publicUrl: "https://example.test/trial/jRCT-001", publicTitle: "Synthetic gastric cancer study", conditions: ["Gastric cancer"], interventions: [], recruitmentStatus: "Recruiting", countries: ["Japan"], secondaryIds: [] }, timestamp);
  assert.equal(trial.sources[0].registry, "jRCT");
  assert.equal(trial.regionTier, "asia");
  assert.equal(trial.recruitment.category, "open");
  const closed = normalizeWhoTrdsRecord({ registry: "CRiS", trialId: "CRiS-002", publicUrl: "https://example.test/trial/CRiS-002", publicTitle: "Synthetic cancer study", conditions: ["Cancer"], interventions: [], recruitmentStatus: "Not recruiting", countries: ["Republic of Korea"], secondaryIds: [] }, timestamp);
  assert.equal(closed.recruitment.category, "not_open");
  assert.equal(closed.recruitment.acceptingNewParticipants, false);
});
