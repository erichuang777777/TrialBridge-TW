import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createQuickMethodReceipt, quickJudgeDemoContract } from "../lib/webmcp/quickJudgeDemo.ts";

const validMethod = {
  searchOrder: ["Taiwan", "Asia", "Worldwide"],
  sources: ["TFDA", "ClinicalTrials.gov"],
  privacy: "Public registry facts only.",
  limitation: "Discuss eligibility with the study team.",
};

test("three-minute judge contract is fixed, public, and no-PHI", () => {
  assert.equal(quickJudgeDemoContract.route, "/webmcp/quickstart");
  assert.equal(quickJudgeDemoContract.targetMinutes, 3);
  assert.deepEqual(quickJudgeDemoContract.publicToolNames, ["trialbridge_method", "search_public_cancer_trials"]);
  assert.equal(quickJudgeDemoContract.safeExecutionTool, "trialbridge_method");
  assert.deepEqual(quickJudgeDemoContract.behavior, {
    acceptsFreeText: false,
    runsCloudModel: false,
    runsRegistrySearch: false,
    changesWorkflowState: false,
    persistsResult: false,
  });
  assert.deepEqual(quickJudgeDemoContract.privacyBoundary, {
    containsHealthInformation: false,
    readsPatientContext: false,
    storesExecutionResult: false,
  });
});

test("safe-method receipt accepts current object and serialized Chrome shapes", () => {
  for (const output of [validMethod, JSON.stringify(validMethod)]) {
    const receipt = createQuickMethodReceipt(output);
    assert.equal(receipt.browserApiUsed, true);
    assert.deepEqual(receipt.searchOrder, ["Taiwan", "Asia", "Worldwide"]);
    assert.equal(receipt.containsHealthInformation, false);
    assert.equal(receipt.persisted, false);
    assert.doesNotMatch(JSON.stringify(receipt), /patient|rawText|maskedText|toolOutput/i);
  }
});

test("safe-method receipt is bounded and rejects malformed results", () => {
  const receipt = createQuickMethodReceipt({
    ...validMethod,
    privacy: "p".repeat(300),
    limitation: "l".repeat(400),
  });
  assert.equal(receipt.privacy.length, 180);
  assert.equal(receipt.limitation.length, 220);
  assert.throws(() => createQuickMethodReceipt("not json"), /non-JSON/);
  assert.throws(() => createQuickMethodReceipt({ ...validMethod, sources: ["one"] }), /bounded TrialBridge contract/);
});

test("quickstart UI registers same-origin public tools and keeps execution explicit", async () => {
  const [page, consoleSource, css] = await Promise.all([
    readFile("app/webmcp/quickstart/page.tsx", "utf8"),
    readFile("app/webmcp/quickstart/_components/QuickJudgeConsole.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
  ]);
  for (const marker of ["three-minute judge demo", "QuickJudgeConsole", "public tools now", "write or enrollment tools", "Agentic Browsing pages passed", "Chrome audit method", "/match?demo=synthetic", "/webmcp"]) {
    assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  for (const marker of ["buildTrialBridgeTools", "registerTool(tool, { signal: registrationController.signal, exposedTo: [location.origin] })", "getTools({ fromOrigins: [location.origin] })", "executeSafeMethodToolCompat", "quickJudgeDemoContract.executionTimeoutMs", "navigator.clipboard.writeText(webMcpLocalTestingFlag)", "Copy Chrome flag", "choose Enabled, relaunch", 'role="status" aria-atomic="true"']) {
    assert.ok(consoleSource.includes(marker), `quickstart console is missing ${marker}`);
  }
  assert.doesNotMatch(consoleSource, /<(?:input|textarea)\b/i);
  assert.match(consoleSource, /<ul className="quick-check-grid">/);
  assert.doesNotMatch(consoleSource, /role="listitem"/);
  assert.match(css, /\.quick-method-actions button[^}]*min-height:\s*44px/);
  assert.match(css, /\.quick-browser-recovery-actions button, \.quick-browser-recovery-actions a[^}]*min-height:\s*44px/);
  assert.match(css, /\.quick-check-grid, \.quick-browser-recovery, \.quickstart-path ol \{ grid-template-columns: 1fr; \}/);
});
