import assert from "node:assert/strict";
import test from "node:test";
import { createWebMcpDiagnosticReceipt } from "../lib/webmcp/diagnosticReceipt.ts";
import { webMcpRuntimeAcceptanceChecks, webMcpRuntimeProbeName, type WebMcpRuntimeAcceptanceResult } from "../lib/webmcp/runtimeAcceptance.ts";

const passingRuntimeAcceptance: WebMcpRuntimeAcceptanceResult = {
  schemaVersion: "1.0", artifactClass: "live_browser_runtime_acceptance",
  startedAt: "2026-09-02T00:00:00.000Z", completedAt: "2026-09-02T00:00:01.000Z", state: "passed",
  probeToolName: webMcpRuntimeProbeName, toolchangeEvents: 2,
  checks: webMcpRuntimeAcceptanceChecks.map((check) => ({ ...check, status: "pass", detail: "Verified." })),
  persistence: "volatile-tab-only", containsHealthInformation: false, storesToolPayloads: false,
  evidenceBoundary: "Current-browser API metadata only. This does not prove Inspector behavior.",
};

test("browser diagnostic receipt is deterministic, bounded to public runtime metadata, and download-only", () => {
  const receipt = createWebMcpDiagnosticReceipt({
    generatedAt: "2026-09-02T00:00:00.000Z", origin: "https://trialbridge.example", browserState: "ready",
    expectedToolNames: ["trialbridge_method", "search_public_cancer_trials"],
    discoveredToolNames: ["search_public_cancer_trials", "unrelated_extension_tool", "trialbridge_method", "trialbridge_method"],
    securityHeaders: { permissionsPolicy: true, openerPolicy: true, noSniff: true }, safeExecutionAvailable: true, safeSelfTestState: "passed",
    runtimeAcceptance: { state: "passed", result: passingRuntimeAcceptance },
    cloudProbe: { state: "ready", requestedModel: "gpt-oss:120b-cloud", reportedModel: "gpt-oss:120b", latencyMs: 742, checkedAt: "2026-09-02T00:00:00.000Z" },
  });
  assert.equal(receipt.schemaVersion, "1.1");
  assert.equal(receipt.persistence, "download-only");
  assert.equal(receipt.containsHealthInformation, false);
  assert.equal(receipt.publicToolDiscovery.complete, true);
  assert.deepEqual(receipt.publicToolDiscovery.discovered, ["search_public_cancer_trials", "trialbridge_method"]);
  assert.deepEqual(receipt.securityHeaders, { permissionsPolicy: true, openerPolicy: true, noSniff: true });
  assert.deepEqual(receipt.safeExecution, { available: true, state: "passed", authority: "trialbridge_method only; read-only and no input" });
  assert.equal(receipt.lifecycleAcceptance.state, "passed");
  assert.equal(receipt.lifecycleAcceptance.checks.every((check) => check.status === "pass"), true);
  assert.equal(receipt.lifecycleAcceptance.toolchangeEvents, 2);
  assert.deepEqual(receipt.cloudProbe, { state: "ready", requestedModel: "gpt-oss:120b-cloud", reportedModel: "gpt-oss:120b", latencyMs: 742, checkedAt: "2026-09-02T00:00:00.000Z", containsHealthInformation: false, storesModelContent: false });
  assert.doesNotMatch(JSON.stringify(receipt), /unrelated_extension_tool|rawText|maskedText|profileFact|trialResult|toolArgument|toolOutput|promptContent/i);
});

test("unsupported browsers still produce an explicit incomplete diagnostic receipt", () => {
  const receipt = createWebMcpDiagnosticReceipt({
    generatedAt: "2026-09-02T00:00:00.000Z", origin: "http://localhost:3001", browserState: "unsupported",
    expectedToolNames: ["trialbridge_method", "search_public_cancer_trials"], discoveredToolNames: [],
    securityHeaders: { permissionsPolicy: true, openerPolicy: true, noSniff: true }, safeExecutionAvailable: false, safeSelfTestState: "idle",
    runtimeAcceptance: { state: "idle" },
    cloudProbe: { state: "not-run" },
  });
  assert.equal(receipt.browserState, "unsupported");
  assert.equal(receipt.publicToolDiscovery.complete, false);
  assert.equal(receipt.safeExecution.available, false);
});
