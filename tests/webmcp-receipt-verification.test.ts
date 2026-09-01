import assert from "node:assert/strict";
import test from "node:test";
import { createWebMcpDiagnosticReceipt } from "../lib/webmcp/diagnosticReceipt.ts";
import { createWebMcpInspectorAcceptanceReceipt, webMcpInspectorAcceptanceCases } from "../lib/webmcp/inspectorAcceptance.ts";
import { verifyWebMcpBrowserDiagnosticReceipt, verifyWebMcpInspectorAcceptanceReceipt } from "../lib/webmcp/receiptVerification.ts";
import { webMcpRuntimeAcceptanceChecks, webMcpRuntimeProbeName, type WebMcpRuntimeAcceptanceResult } from "../lib/webmcp/runtimeAcceptance.ts";

const passingRuntimeAcceptance: WebMcpRuntimeAcceptanceResult = {
  schemaVersion: "1.0", artifactClass: "live_browser_runtime_acceptance",
  startedAt: "2026-09-02T12:00:00.000Z", completedAt: "2026-09-02T12:00:01.000Z", state: "passed",
  probeToolName: webMcpRuntimeProbeName, toolchangeEvents: 2,
  checks: webMcpRuntimeAcceptanceChecks.map((check) => ({ ...check, status: "pass", detail: "Verified." })),
  persistence: "volatile-tab-only", containsHealthInformation: false, storesToolPayloads: false,
  evidenceBoundary: "Current-browser API metadata only. This does not prove Inspector behavior.",
};

test("downloaded browser runtime metadata can be verified against the current public contract", () => {
  const receipt = createWebMcpDiagnosticReceipt({
    generatedAt: "2026-09-02T12:00:00.000Z", origin: "https://trialbridge.example", browserState: "ready",
    expectedToolNames: ["trialbridge_method", "search_public_cancer_trials"],
    discoveredToolNames: ["search_public_cancer_trials", "trialbridge_method"],
    securityHeaders: { permissionsPolicy: true, openerPolicy: true, noSniff: true },
    safeExecutionAvailable: true, safeSelfTestState: "passed", runtimeAcceptance: { state: "passed", result: passingRuntimeAcceptance }, cloudProbe: { state: "not-run" },
  });
  assert.deepEqual(verifyWebMcpBrowserDiagnosticReceipt(receipt), {
    kind: "browser_runtime", ok: true, errors: [], metadataOnly: true, evidenceClass: "runtime_metadata",
  });
  const incomplete = JSON.parse(JSON.stringify(receipt)) as { lifecycleAcceptance: { checks: Array<{ id: string; status: string }> } };
  incomplete.lifecycleAcceptance.checks[0]!.status = "fail";
  assert.equal(verifyWebMcpBrowserDiagnosticReceipt(incomplete).errors.some((error) => /every live lifecycle check/i.test(error)), true);
});

test("runtime verifier rejects unsupported or incomplete browser receipts", () => {
  const receipt = createWebMcpDiagnosticReceipt({
    generatedAt: "2026-09-02T12:00:00.000Z", origin: "http://localhost:3001", browserState: "unsupported",
    expectedToolNames: ["trialbridge_method", "search_public_cancer_trials"], discoveredToolNames: [],
    securityHeaders: { permissionsPolicy: true, openerPolicy: true, noSniff: true },
    safeExecutionAvailable: false, safeSelfTestState: "idle", runtimeAcceptance: { state: "idle" }, cloudProbe: { state: "not-run" },
  });
  const result = verifyWebMcpBrowserDiagnosticReceipt(receipt);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => /runtime state/i.test(error)), true);
  assert.equal(result.errors.some((error) => /execution/i.test(error)), true);
});

test("manual Inspector verifier accepts only a complete passing self-attestation", () => {
  const outcomes = Object.fromEntries(webMcpInspectorAcceptanceCases.map((item) => [item.id, "pass"])) as Record<(typeof webMcpInspectorAcceptanceCases)[number]["id"], "pass">;
  const receipt = createWebMcpInspectorAcceptanceReceipt({ generatedAt: "2026-09-02T12:00:00.000Z", origin: "https://trialbridge.example", chromeMajor: 152, outcomes });
  assert.deepEqual(verifyWebMcpInspectorAcceptanceReceipt(receipt), {
    kind: "manual_inspector", ok: true, errors: [], metadataOnly: true, evidenceClass: "manual_self_attestation",
  });
  const partial = createWebMcpInspectorAcceptanceReceipt({ generatedAt: "2026-09-02T12:00:00.000Z", origin: "https://trialbridge.example", outcomes: {} });
  assert.equal(verifyWebMcpInspectorAcceptanceReceipt(partial).ok, false);
});
