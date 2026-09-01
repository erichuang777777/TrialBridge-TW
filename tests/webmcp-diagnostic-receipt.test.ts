import assert from "node:assert/strict";
import test from "node:test";
import { createWebMcpDiagnosticReceipt } from "../lib/webmcp/diagnosticReceipt.ts";

test("browser diagnostic receipt is deterministic, bounded to public runtime metadata, and download-only", () => {
  const receipt = createWebMcpDiagnosticReceipt({
    generatedAt: "2026-09-02T00:00:00.000Z", origin: "https://trialbridge.example", browserState: "ready",
    expectedToolNames: ["trialbridge_method", "search_public_cancer_trials"],
    discoveredToolNames: ["search_public_cancer_trials", "unrelated_extension_tool", "trialbridge_method", "trialbridge_method"],
    securityHeaders: { permissionsPolicy: true, openerPolicy: true, noSniff: true }, safeExecutionAvailable: true, safeSelfTestState: "passed",
    cloudProbe: { state: "ready", requestedModel: "gpt-oss:120b-cloud", reportedModel: "gpt-oss:120b", latencyMs: 742, checkedAt: "2026-09-02T00:00:00.000Z" },
  });
  assert.equal(receipt.persistence, "download-only");
  assert.equal(receipt.containsHealthInformation, false);
  assert.equal(receipt.publicToolDiscovery.complete, true);
  assert.deepEqual(receipt.publicToolDiscovery.discovered, ["search_public_cancer_trials", "trialbridge_method"]);
  assert.deepEqual(receipt.securityHeaders, { permissionsPolicy: true, openerPolicy: true, noSniff: true });
  assert.deepEqual(receipt.safeExecution, { available: true, state: "passed", authority: "trialbridge_method only; read-only and no input" });
  assert.deepEqual(receipt.cloudProbe, { state: "ready", requestedModel: "gpt-oss:120b-cloud", reportedModel: "gpt-oss:120b", latencyMs: 742, checkedAt: "2026-09-02T00:00:00.000Z", containsHealthInformation: false, storesModelContent: false });
  assert.doesNotMatch(JSON.stringify(receipt), /unrelated_extension_tool|rawText|maskedText|profileFact|trialResult|toolArgument|toolOutput|promptContent/i);
});

test("unsupported browsers still produce an explicit incomplete diagnostic receipt", () => {
  const receipt = createWebMcpDiagnosticReceipt({
    generatedAt: "2026-09-02T00:00:00.000Z", origin: "http://localhost:3001", browserState: "unsupported",
    expectedToolNames: ["trialbridge_method", "search_public_cancer_trials"], discoveredToolNames: [],
    securityHeaders: { permissionsPolicy: true, openerPolicy: true, noSniff: true }, safeExecutionAvailable: false, safeSelfTestState: "idle",
    cloudProbe: { state: "not-run" },
  });
  assert.equal(receipt.browserState, "unsupported");
  assert.equal(receipt.publicToolDiscovery.complete, false);
  assert.equal(receipt.safeExecution.available, false);
});
