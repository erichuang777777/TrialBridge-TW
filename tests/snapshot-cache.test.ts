import assert from "node:assert/strict";
import test from "node:test";
import { StaleWhileRevalidateSnapshot } from "../lib/trials/snapshotCache.ts";

const hour = 60 * 60 * 1000;

test("snapshot cache serves fresh data without another load", async () => {
  let now = Date.parse("2026-09-01T00:00:00.000Z");
  let loads = 0;
  const cache = new StaleWhileRevalidateSnapshot({
    load: async () => `snapshot-${++loads}`,
    freshForMs: 24 * hour,
    maxAgeMs: 7 * 24 * hour,
    now: () => now,
  });
  const live = await cache.read();
  now += hour;
  const fresh = await cache.read();
  assert.deepEqual(live, { value: "snapshot-1", mode: "live", loadedAt: "2026-09-01T00:00:00.000Z", storage: "process_memory" });
  assert.deepEqual(fresh, { value: "snapshot-1", mode: "fresh_cache", loadedAt: live.loadedAt, storage: "process_memory" });
  assert.equal(loads, 1);
});

test("stale snapshot returns immediately while one shared refresh runs", async () => {
  let now = Date.parse("2026-09-01T00:00:00.000Z");
  let loads = 0;
  let releaseRefresh: ((value: string) => void) | undefined;
  const cache = new StaleWhileRevalidateSnapshot({
    load: async () => {
      loads += 1;
      if (loads === 1) return "snapshot-1";
      return new Promise<string>((resolve) => { releaseRefresh = resolve; });
    },
    freshForMs: 24 * hour,
    maxAgeMs: 7 * 24 * hour,
    now: () => now,
  });
  await cache.read();
  now += 25 * hour;
  const firstStale = await cache.read();
  const secondStale = await cache.read();
  assert.equal(firstStale.mode, "stale_cache");
  assert.equal(secondStale.value, "snapshot-1");
  assert.equal(loads, 2);
  assert.ok(releaseRefresh);
  releaseRefresh("snapshot-2");
  await new Promise((resolve) => setImmediate(resolve));
  const refreshed = await cache.read();
  assert.deepEqual(refreshed, { value: "snapshot-2", mode: "fresh_cache", loadedAt: new Date(now).toISOString(), storage: "process_memory" });
});

test("snapshot older than the maximum age fails closed when refresh fails", async () => {
  let now = Date.parse("2026-09-01T00:00:00.000Z");
  let fail = false;
  const cache = new StaleWhileRevalidateSnapshot({
    load: async () => {
      if (fail) throw new Error("upstream unavailable");
      return "snapshot-1";
    },
    freshForMs: 24 * hour,
    maxAgeMs: 7 * 24 * hour,
    now: () => now,
  });
  await cache.read();
  now += 8 * 24 * hour;
  fail = true;
  await assert.rejects(cache.read(), /upstream unavailable/);
});

test("concurrent cold readers share one load", async () => {
  let loads = 0;
  let release: ((value: string) => void) | undefined;
  const cache = new StaleWhileRevalidateSnapshot({
    load: () => {
      loads += 1;
      return new Promise<string>((resolve) => { release = resolve; });
    },
    freshForMs: hour,
    maxAgeMs: 2 * hour,
    now: () => Date.parse("2026-09-01T00:00:00.000Z"),
  });
  const first = cache.read();
  const second = cache.read();
  assert.equal(loads, 1);
  assert.ok(release);
  release("shared");
  assert.equal((await first).value, "shared");
  assert.equal((await second).value, "shared");
});
