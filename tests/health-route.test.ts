import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { GET } from "../app/api/health/route.ts";
import { writeTfdaSnapshotFile } from "../lib/trials/tfdaSnapshot.ts";
import { tfdaFixture } from "./fixtures/registry.ts";

test("health reports only bounded TFDA snapshot readiness and degrades for a configured corrupt snapshot", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "trialbridge-health-snapshot-"));
  const snapshotPath = path.join(directory, "tfda-public.json");
  const previousPath = process.env.TFDA_SNAPSHOT_PATH;
  try {
    process.env.TFDA_SNAPSHOT_PATH = snapshotPath;
    await writeTfdaSnapshotFile(snapshotPath, [tfdaFixture]);
    const readyResponse = await GET();
    const ready = await readyResponse.json() as {
      status: string;
      checks: { tfdaSnapshot: Record<string, unknown> };
    };
    assert.equal(readyResponse.status, 200);
    assert.equal(ready.status, "ok");
    assert.equal(ready.checks.tfdaSnapshot.status, "fresh");
    assert.equal(ready.checks.tfdaSnapshot.containsPatientData, false);
    assert.equal("path" in ready.checks.tfdaSnapshot, false);
    assert.equal("records" in ready.checks.tfdaSnapshot, false);

    await writeFile(snapshotPath, "{\"corrupt\":true}", "utf8");
    const degradedResponse = await GET();
    const degraded = await degradedResponse.json() as {
      status: string;
      checks: { configuration: string; tfdaSnapshot: { status: string } };
    };
    assert.equal(degradedResponse.status, 503);
    assert.equal(degraded.status, "degraded");
    assert.equal(degraded.checks.configuration, "invalid");
    assert.equal(degraded.checks.tfdaSnapshot.status, "misconfigured");
  } finally {
    if (previousPath === undefined) delete process.env.TFDA_SNAPSHOT_PATH;
    else process.env.TFDA_SNAPSHOT_PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  }
});
