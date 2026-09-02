import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyWebMcpBrowserDiagnosticReceipt } from "../lib/webmcp/receiptVerification.ts";
import { webMcpRuntimeAcceptanceChecks, webMcpRuntimeProbeName } from "../lib/webmcp/runtimeAcceptance.ts";

test("recorded Chrome runtime evidence is six-of-six, metadata-only, and cleaned up", async () => {
  const source = await readFile(new URL("../evals/webmcp-browser-runtime-acceptance.json", import.meta.url), "utf8");
  const artifact = JSON.parse(source) as {
    artifactClass: string;
    browser: { product: string; channel: string; version: string; headless: boolean; localTestingFeatures: string[] };
    target: { origin: string; route: string; secureContext: boolean };
    result: { consoleErrors: number; postRunToolNames: string[]; probePresentAfter: boolean; receipt: Record<string, unknown> };
    evidenceBoundary: string;
  };

  assert.equal(artifact.artifactClass, "recorded_live_browser_runtime_acceptance");
  assert.deepEqual({ product: artifact.browser.product, channel: artifact.browser.channel, version: artifact.browser.version }, { product: "Chrome for Testing", channel: "Beta", version: "153.0.8010.12" });
  assert.equal(artifact.browser.headless, true);
  assert.deepEqual(artifact.browser.localTestingFeatures, ["WebMCP", "WebMCPTesting"]);
  assert.deepEqual(artifact.target, { origin: "http://localhost:3001", route: "/webmcp", secureContext: true });
  assert.equal(verifyWebMcpBrowserDiagnosticReceipt(artifact.result.receipt).ok, true);
  const lifecycle = artifact.result.receipt.lifecycleAcceptance as { state: string; probeToolName: string; checks: Array<{ id: string; status: string }> };
  assert.equal(lifecycle.state, "passed");
  assert.equal(lifecycle.probeToolName, webMcpRuntimeProbeName);
  assert.deepEqual(lifecycle.checks.map((item) => item.id).sort(), webMcpRuntimeAcceptanceChecks.map((item) => item.id).sort());
  assert.equal(lifecycle.checks.every((item) => item.status === "pass"), true);
  assert.equal(artifact.result.consoleErrors, 0);
  assert.equal(artifact.result.probePresentAfter, false);
  assert.deepEqual(artifact.result.postRunToolNames, ["search_public_cancer_trials", "trialbridge_method"]);
  assert.match(artifact.evidenceBoundary, /not an Origin Trial production deployment/i);
  assert.doesNotMatch(source, /"(?:rawText|maskedText|medicalNote|confirmedProfile|profileFact|trialResult|prompt|toolArgument|toolOutput|content|thinking)"\s*:/i);
});
