import assert from "node:assert/strict";
import test from "node:test";
import { ClinicalTrialsGovAdapter, normalizeClinicalTrialsGovStudy } from "../lib/trials/adapters/clinicalTrialsGov.ts";
import { normalizeTfdaRecord, TfdaAdapter } from "../lib/trials/adapters/tfda.ts";
import { deduplicateTrials } from "../lib/trials/dedupe.ts";
import { rankTrials } from "../lib/trials/regions.ts";
import { trialSearchRequestSchema } from "../lib/trials/schema.ts";
import { searchTrialRegistries } from "../lib/trials/search.ts";
import type { TrialAdapterSearchOptions, TrialRegistryAdapter } from "../lib/trials/types.ts";
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
  assert.equal(trial.contacts.some((contact) => contact.role === "investigator" && contact.name === "Synthetic Study Chair"), true);
  assert.equal(trial.sources[0].lastUpdated, "2026-08-20");
});

test("ClinicalTrials.gov forwards the registry deadline signal to both upstream requests", async () => {
  const observedSignals: Array<AbortSignal | null | undefined> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    observedSignals.push(init?.signal);
    const url = String(input);
    return new Response(JSON.stringify(url.endsWith("/version")
      ? { dataTimestamp: "2026-09-02T00:00:00Z" }
      : { studies: [ctgovFixture], totalCount: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const controller = new AbortController();
  await new ClinicalTrialsGovAdapter(fetcher).search(
    { condition: "gastric cancer", pageSize: 1, includeNotOpen: false },
    { signal: controller.signal },
  );
  assert.equal(observedSignals.length, 2);
  assert.equal(observedSignals.every((signal) => signal === controller.signal), true);
});

test("deduplication merges only explicit shared identifiers and keeps both sources", () => {
  const tfda = normalizeTfdaRecord(tfdaFixture, retrievedAt);
  const ctgov = normalizeClinicalTrialsGovStudy(ctgovFixture, retrievedAt);
  const merged = deduplicateTrials([ctgov, tfda]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].canonicalId, tfda.canonicalId);
  assert.deepEqual(merged[0].sources.map((source) => source.registry).sort(), ["ClinicalTrials.gov", "TFDA"]);
  assert.equal(merged[0].eligibility.minimumAge, "18 Years");
  assert.equal(merged[0].contacts.some((contact) => contact.role === "investigator"), true);

  const unrelated = { ...ctgov, identifiers: ["NCT99999999"], canonicalId: "ctgov:nct99999999" };
  assert.equal(deduplicateTrials([tfda, unrelated]).length, 2);
});

test("an exact TFDA duplicate uses the ClinicalTrials.gov recruitment state when TFDA does not publish one", () => {
  const tfdaUnknown = normalizeTfdaRecord({ ...tfdaFixture, 執行狀態: undefined }, retrievedAt);
  const ctgov = normalizeClinicalTrialsGovStudy(ctgovFixture, retrievedAt);
  const merged = deduplicateTrials([tfdaUnknown, ctgov]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].recruitment.raw, "RECRUITING");
  assert.equal(merged[0].recruitment.category, "open");
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
  assert.deepEqual(result.sources[0].dataState, { mode: "live", loadedAt: result.sources[0].retrievedAt, storage: "process_memory" });
  assert.equal(result.sources[0].durationMs >= 0, true);
  assert.equal(result.failures[0].registry, "ClinicalTrials.gov");
  assert.equal(result.failures[0].message, "Registry temporarily unavailable");
  assert.equal(result.failures[0].code, "SOURCE_UNAVAILABLE");
  assert.equal(result.failures[0].durationMs >= 0, true);
});

test("a registry deadline preserves another source and reports a machine-readable timeout", async () => {
  let timeoutSignal: AbortSignal | undefined;
  const never: TrialRegistryAdapter = {
    registry: "ClinicalTrials.gov",
    search(_input, options: TrialAdapterSearchOptions = {}) {
      timeoutSignal = options.signal;
      return new Promise(() => undefined);
    },
  };
  const healthy = new TfdaAdapter(fetch, async () => [tfdaFixture]);
  const result = await searchTrialRegistries(
    { condition: "胃癌", pageSize: 10, includeNotOpen: false },
    [never, healthy],
    {},
    { timeoutMs: 5 },
  );
  assert.equal(result.trials.length, 1);
  assert.equal(timeoutSignal?.aborted, true);
  assert.deepEqual(result.failures, [{
    registry: "ClinicalTrials.gov",
    message: "Source did not respond within 5 ms",
    code: "SOURCE_TIMEOUT",
    durationMs: 5,
  }]);
});

test("caller cancellation aborts every registry source and rejects with the caller's reason", async () => {
  const observedSignals: AbortSignal[] = [];
  const never = (registry: TrialRegistryAdapter["registry"]): TrialRegistryAdapter => ({
    registry,
    search(_input, options: TrialAdapterSearchOptions = {}) {
      assert.ok(options.signal);
      observedSignals.push(options.signal);
      return new Promise(() => undefined);
    },
  });
  const controller = new AbortController();
  const reason = new DOMException("Synthetic WebMCP cancellation", "AbortError");
  const pending = searchTrialRegistries(
    { condition: "胃癌", pageSize: 10, includeNotOpen: false },
    [never("TFDA"), never("ClinicalTrials.gov")],
    {},
    { timeoutMs: 1_000, signal: controller.signal },
  );
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort(reason);
  await assert.rejects(pending, (error: unknown) => error === reason);
  assert.equal(observedSignals.length, 2);
  assert.equal(observedSignals.every((signal) => signal.aborted && signal.reason === reason), true);
});

test("TFDA stops one cancelled caller from waiting without cancelling the shared snapshot load", async () => {
  let finishLoad: ((records: typeof tfdaFixture[]) => void) | undefined;
  const loading = new Promise<typeof tfdaFixture[]>((resolve) => { finishLoad = resolve; });
  const adapter = new TfdaAdapter(fetch, () => loading);
  const controller = new AbortController();
  const reason = new DOMException("Synthetic caller left", "AbortError");
  const pending = adapter.search({ condition: "胃癌", pageSize: 10, includeNotOpen: false }, { signal: controller.signal });
  controller.abort(reason);
  await assert.rejects(pending, (error: unknown) => error === reason);
  finishLoad?.([tfdaFixture]);
  assert.equal((await adapter.search({ condition: "胃癌", pageSize: 10, includeNotOpen: false })).trials.length, 1);
});

test("successful source receipts expose independently measured latency", async () => {
  let clock = 100;
  const healthy = new TfdaAdapter(fetch, async () => {
    clock = 142;
    return [tfdaFixture];
  });
  const result = await searchTrialRegistries(
    { condition: "胃癌", pageSize: 10, includeNotOpen: false },
    [healthy],
    {},
    { timeoutMs: 1_000, now: () => clock },
  );
  assert.equal(result.sources[0].durationMs, 42);
});

test("public search request rejects raw-note fields", () => {
  const parsed = trialSearchRequestSchema.safeParse({ condition: "胃癌", rawNote: "sensitive" });
  assert.equal(parsed.success, false);
});
