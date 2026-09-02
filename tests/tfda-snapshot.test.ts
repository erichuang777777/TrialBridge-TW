import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { TfdaAdapter } from "../lib/trials/adapters/tfda.ts";
import {
  inspectTfdaSnapshotDeployment,
  readTfdaSnapshotFile,
  resolveTfdaSnapshotPath,
  tfdaSnapshotManifestPath,
  writeTfdaSnapshotFile,
} from "../lib/trials/tfdaSnapshot.ts";
import { tfdaFixture } from "./fixtures/registry.ts";

const generatedAt = "2026-09-02T00:00:00.000Z";

async function withTempSnapshot(run: (directory: string, snapshotPath: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), "trialbridge-tfda-snapshot-"));
  const snapshotPath = path.join(directory, "tfda-public.json");
  try {
    await run(directory, snapshotPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("scheduled TFDA snapshot writes validated public data and the adapter reads it without network fallback", async () => {
  await withTempSnapshot(async (_directory, snapshotPath) => {
    const manifest = await writeTfdaSnapshotFile(snapshotPath, [tfdaFixture], generatedAt);
    assert.equal(manifest.recordCount, 1);
    assert.equal(manifest.containsPatientData, false);
    assert.match(manifest.recordsDigestSha256, /^[a-f0-9]{64}$/);

    const artifact = JSON.parse(await readFile(snapshotPath, "utf8")) as Record<string, unknown>;
    const sidecar = JSON.parse(await readFile(tfdaSnapshotManifestPath(snapshotPath), "utf8")) as Record<string, unknown>;
    assert.equal(Array.isArray(artifact.records), true);
    assert.equal(artifact.containsPatientData, false);
    assert.equal("records" in sidecar, false);
    assert.equal("path" in sidecar, false);

    const read = await readTfdaSnapshotFile(snapshotPath, Date.parse("2026-09-02T01:00:00.000Z"));
    assert.equal(read.mode, "fresh_cache");
    assert.equal(read.storage, "scheduled_file");
    assert.equal(read.value.length, 1);

    const noNetwork: typeof fetch = async () => { throw new Error("network fallback must not run"); };
    const result = await new TfdaAdapter(noNetwork, undefined, {
      snapshotPath,
      now: () => Date.parse("2026-09-02T01:00:00.000Z"),
    }).search({ condition: "胃癌", pageSize: 5, includeNotOpen: true });
    assert.equal(result.trials.length, 1);
    assert.deepEqual(result.dataState, { mode: "fresh_cache", loadedAt: generatedAt, storage: "scheduled_file" });
  });
});

test("scheduled TFDA snapshot is stale after one day and fails closed after seven days", async () => {
  await withTempSnapshot(async (_directory, snapshotPath) => {
    await writeTfdaSnapshotFile(snapshotPath, [tfdaFixture], generatedAt);
    const staleNow = Date.parse("2026-09-04T00:00:00.000Z");
    assert.equal((await readTfdaSnapshotFile(snapshotPath, staleNow)).mode, "stale_cache");
    assert.equal((await inspectTfdaSnapshotDeployment({ TFDA_SNAPSHOT_PATH: snapshotPath }, staleNow)).status, "stale");

    const expiredNow = Date.parse("2026-09-10T00:00:00.000Z");
    await assert.rejects(readTfdaSnapshotFile(snapshotPath, expiredNow), /older than seven days/);
    assert.equal((await inspectTfdaSnapshotDeployment({ TFDA_SNAPSHOT_PATH: snapshotPath }, expiredNow)).status, "expired");
  });
});

test("scheduled TFDA snapshot rejects tampering and a mismatched manifest", async () => {
  await withTempSnapshot(async (_directory, snapshotPath) => {
    await writeTfdaSnapshotFile(snapshotPath, [tfdaFixture], generatedAt);
    const artifact = JSON.parse(await readFile(snapshotPath, "utf8")) as { records: Array<Record<string, unknown>> };
    artifact.records[0].臨床試驗計畫中文名稱 = `${String(artifact.records[0].臨床試驗計畫中文名稱)} altered`;
    await writeFile(snapshotPath, JSON.stringify(artifact), "utf8");
    await assert.rejects(readTfdaSnapshotFile(snapshotPath), /digest or record count/);
    assert.equal((await inspectTfdaSnapshotDeployment({ TFDA_SNAPSHOT_PATH: snapshotPath })).status, "misconfigured");

    await writeTfdaSnapshotFile(snapshotPath, [tfdaFixture], generatedAt);
    const manifestPath = tfdaSnapshotManifestPath(snapshotPath);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { recordCount: number };
    manifest.recordCount += 1;
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    await assert.rejects(readTfdaSnapshotFile(snapshotPath), /manifest does not match/);
    assert.equal((await inspectTfdaSnapshotDeployment({ TFDA_SNAPSHOT_PATH: snapshotPath })).status, "misconfigured");
  });
});

test("TFDA snapshot deployment state is bounded for fallback, invalid, missing, and fresh configurations", async () => {
  await withTempSnapshot(async (_directory, snapshotPath) => {
    assert.equal((await inspectTfdaSnapshotDeployment({})).status, "request_time_fallback");
    assert.equal((await inspectTfdaSnapshotDeployment({ TFDA_SNAPSHOT_PATH: "relative.json" })).status, "misconfigured");
    assert.equal((await inspectTfdaSnapshotDeployment({ TFDA_SNAPSHOT_PATH: snapshotPath })).status, "missing");

    await writeTfdaSnapshotFile(snapshotPath, [tfdaFixture], generatedAt);
    const fresh = await inspectTfdaSnapshotDeployment({ TFDA_SNAPSHOT_PATH: snapshotPath }, Date.parse("2026-09-02T01:00:00.000Z"));
    assert.deepEqual(fresh, {
      status: "fresh",
      configured: true,
      storage: "scheduled_file",
      generatedAt,
      recordCount: 1,
      containsPatientData: false,
    });
    assert.equal("path" in fresh, false);
  });
});

test("TFDA snapshot replacement leaves one complete artifact and no temporary files", async () => {
  await withTempSnapshot(async (directory, snapshotPath) => {
    await writeTfdaSnapshotFile(snapshotPath, [tfdaFixture], generatedAt);
    const replacement = { ...tfdaFixture, TFDA收文號: "replacement-public-id" };
    await writeTfdaSnapshotFile(snapshotPath, [replacement], "2026-09-02T02:00:00.000Z");
    const read = await readTfdaSnapshotFile(snapshotPath, Date.parse("2026-09-02T03:00:00.000Z"));
    assert.equal(read.value[0].TFDA收文號, "replacement-public-id");
    assert.deepEqual((await readdir(directory)).sort(), ["tfda-public.json", "tfda-public.json.manifest.json"]);
  });
});

test("TFDA snapshot path must be one exact absolute JSON file", () => {
  assert.equal(resolveTfdaSnapshotPath(undefined), undefined);
  assert.throws(() => resolveTfdaSnapshotPath("relative.json"), /absolute/);
  assert.throws(() => resolveTfdaSnapshotPath(` ${path.resolve("snapshot.json")}`), /without surrounding whitespace/);
  assert.throws(() => resolveTfdaSnapshotPath(path.parse(path.resolve("snapshot.json")).root), /absolute .json|filesystem root/);
});

test("recorded live ingestion evidence is metadata-only and preserves its limitations", async () => {
  const evidence = JSON.parse(await readFile(path.join(process.cwd(), "evals", "tfda-snapshot-ingestion.json"), "utf8")) as {
    evidenceClass: string;
    result: { recordCount: number; snapshotBytes: number; recordsDigestSha256: string; containsPatientData: boolean; artifactRetained: boolean };
    validation: { deploymentStatus: string; storage: string; adapterNetworkFallbackAttempted: boolean; boundedResultCount: number };
    limitations: string[];
    [key: string]: unknown;
  };
  assert.equal(evidence.evidenceClass, "recorded_live_official_ingestion");
  assert.equal(evidence.result.recordCount, 18_493);
  assert.equal(evidence.result.snapshotBytes, 175_674_023);
  assert.match(evidence.result.recordsDigestSha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.result.containsPatientData, false);
  assert.equal(evidence.result.artifactRetained, false);
  assert.deepEqual(evidence.validation, {
    deploymentStatus: "fresh",
    storage: "scheduled_file",
    adapterNetworkFallbackAttempted: false,
    publicQuery: "胃癌",
    boundedResultCount: 3,
  });
  assert.equal(evidence.limitations.length >= 3, true);
  assert.equal("records" in evidence, false);
  assert.equal("path" in evidence, false);
});
