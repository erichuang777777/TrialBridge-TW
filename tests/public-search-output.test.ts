import assert from "node:assert/strict";
import test from "node:test";
import { createRegistryQueryPlan } from "../lib/trials/queryBridge.ts";
import { normalizeClinicalTrialsGovStudy } from "../lib/trials/adapters/clinicalTrialsGov.ts";
import { createBoundedPublicSearchOutput } from "../lib/webmcp/publicSearchOutput.ts";
import { maxWebMcpOutputChars } from "../lib/webmcp/output.ts";
import { ctgovFixture } from "./fixtures/registry.ts";

test("bounded public search preserves structured bilingual provenance before dropping long records", () => {
  const base = normalizeClinicalTrialsGovStudy(ctgovFixture, "2026-09-02T00:00:00.000Z");
  const trials = Array.from({ length: 5 }, (_, index) => ({
    ...base,
    canonicalId: `${base.canonicalId}-${index}`,
    identifiers: [`${base.canonicalId}-${index}`],
    title: `${base.title} ${"long title ".repeat(40)}`,
    sources: base.sources.map((source) => ({ ...source, registryId: `${source.registryId}-${index}`, url: `https://example.com/${"source".repeat(80)}/${index}` })),
  }));
  const output = createBoundedPublicSearchOutput({
    query: "胃癌",
    queryPlan: createRegistryQueryPlan("胃癌"),
    trials,
    sources: [{ registry: "TFDA", count: trials.length, retrievedAt: "2026-09-02T00:00:00.000Z", dataState: { mode: "fresh_cache", loadedAt: "2026-09-01T12:00:00.000Z" } }],
    failures: [{ registry: "ClinicalTrials.gov", message: "Registry temporarily unavailable" }],
    limitation: "Synthetic output-boundary test.",
  }) as {
    queryPlan: { registryConditions: Record<string, string> };
    sourceStatus: { completed: Array<{ registry: string; count: number; dataState?: { mode: string; loadedAt: string } }>; failed: Array<{ registry: string; message: string }> };
    records: unknown[];
    omittedRecords: number;
    content?: string;
  };
  assert.equal(JSON.stringify(output).length <= maxWebMcpOutputChars, true);
  assert.equal(output.content, undefined);
  assert.deepEqual(output.queryPlan.registryConditions, { TFDA: "胃癌", "ClinicalTrials.gov": "gastric cancer" });
  assert.deepEqual(output.sourceStatus.completed.map(({ registry, count }) => ({ registry, count })), [{ registry: "TFDA", count: trials.length }]);
  assert.deepEqual(output.sourceStatus.completed[0].dataState, { mode: "fresh_cache", loadedAt: "2026-09-01T12:00:00.000Z" });
  assert.deepEqual(output.sourceStatus.failed, [{ registry: "ClinicalTrials.gov", message: "Registry temporarily unavailable" }]);
  assert.equal(output.records.length < trials.length, true);
  assert.equal(output.records.length + output.omittedRecords, trials.length);
});
