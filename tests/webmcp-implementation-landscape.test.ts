import assert from "node:assert/strict";
import test from "node:test";
import { webMcpImplementationLandscape } from "../lib/webmcp/implementationLandscape.ts";

test("implementation landscape is dated, source-linked, and explicit about its evidence boundary", () => {
  assert.equal(webMcpImplementationLandscape.auditedAt, "2026-09-02");
  assert.equal(webMcpImplementationLandscape.upstreamCommit, "41d12f0");
  assert.match(webMcpImplementationLandscape.evidenceBoundary, /Source-reported.*not.*local runtime verification/i);
  assert.deepEqual(webMcpImplementationLandscape.entries.map((entry) => [entry.platform, entry.status]), [
    ["ChatGPT Desktop", "supported"],
    ["Chrome 149", "origin_trial"],
    ["Brave Leo", "experimental"],
  ]);
  assert.equal(webMcpImplementationLandscape.entries.every((entry) => entry.sourceUrl.startsWith("https://")), true);
});
