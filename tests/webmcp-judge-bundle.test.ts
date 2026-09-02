import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { webMcpCapabilityInventory } from "../lib/webmcp/capabilityInventory.ts";
import { webMcpConformanceMatrix, webMcpJudgeBundle } from "../lib/webmcp/judgeBundle.ts";
import { webMcpSpecCrosswalk, webMcpSpecCrosswalkBundle } from "../lib/webmcp/specCrosswalk.ts";

test("judge bundle is deterministic, source-linked, and contains no workflow payload", () => {
  assert.equal(webMcpJudgeBundle.schemaVersion, "1.0");
  assert.equal(webMcpJudgeBundle.artifactClass, "competition_evidence_not_protocol_metadata");
  assert.equal(webMcpJudgeBundle.privacyBoundary.containsHealthInformation, false);
  assert.equal(webMcpJudgeBundle.privacyBoundary.readsCurrentBrowserSession, false);
  assert.equal(webMcpJudgeBundle.privacyBoundary.readsMedicalWorkflowState, false);
  assert.equal(webMcpJudgeBundle.summary.declarativeTools, 1);
  assert.equal(webMcpJudgeBundle.summary.imperativeTools, 7);
  assert.equal(webMcpJudgeBundle.summary.writeOrEnrollmentTools, 0);
  assert.equal(webMcpJudgeBundle.summary.manualInspectorCases, 6);
  assert.equal(webMcpJudgeBundle.summary.toolContracts, 8);
  assert.equal(webMcpJudgeBundle.summary.capabilityStates, 4);
  assert.equal(webMcpJudgeBundle.summary.runtimeAcceptanceChecks, 6);
  assert.equal(webMcpJudgeBundle.summary.recordedBrowserRuntimeChecksPassed, 6);
  assert.equal(webMcpJudgeBundle.summary.specificationClauses, 8);
  assert.equal(webMcpJudgeBundle.summary.webMcpVisitorInstallRequired, false);
  assert.equal(webMcpJudgeBundle.specificationCrosswalk.upstreamCommit, "41d12f057167ccf5954dbcf49d99502cb6c84491");
  assert.equal(webMcpJudgeBundle.browserSetup.inspector.separateFromWebMcp, true);
  assert.equal(webMcpJudgeBundle.summary.liveAgentRehearsalScenarios, 4);
  assert.equal(webMcpJudgeBundle.liveAgentRehearsal.behavior.acceptsFreeText, false);
  assert.equal(webMcpJudgeBundle.liveAgentRehearsal.behavior.executesSelectedTool, false);
  assert.equal(webMcpJudgeBundle.liveAgentRehearsal.privacyBoundary.containsHealthInformation, false);
  assert.deepEqual(webMcpJudgeBundle.toolContractCatalog, { route: "/webmcp/contracts.json", contractVersion: "2026-09-02.1", tools: 8, withinChromeGuidance: 8, containsHealthInformation: false });
  assert.equal(webMcpJudgeBundle.capabilityStateModel.artifactClass, "synthetic_capability_state_model_not_runtime_evidence");
  assert.deepEqual(webMcpJudgeBundle.capabilityStateModel.states.map((state) => state.activeImperativeToolNames.length), [2, 2, 6, 7]);
  assert.equal(webMcpJudgeBundle.capabilityStateModel.privacyBoundary.containsHealthInformation, false);
  assert.equal(webMcpJudgeBundle.runtimeAcceptanceProfile.artifactClass, "browser_runtime_suite_definition_not_runtime_result");
  assert.equal(webMcpJudgeBundle.runtimeAcceptanceProfile.checks.length, 6);
  assert.deepEqual(webMcpJudgeBundle.runtimeAcceptanceProfile.privacyBoundary, { containsHealthInformation: false, storesToolPayloads: false, networkRequests: false });
  assert.equal(webMcpJudgeBundle.recordedBrowserRuntime.artifactClass, "recorded_live_browser_runtime_acceptance");
  assert.equal(webMcpJudgeBundle.recordedBrowserRuntime.browser.version, "153.0.8010.12");
  assert.equal(webMcpJudgeBundle.recordedBrowserRuntime.checksPassed, 6);
  assert.equal(webMcpJudgeBundle.recordedBrowserRuntime.checksTotal, 6);
  assert.equal(webMcpJudgeBundle.recordedBrowserRuntime.consoleErrors, 0);
  assert.equal(webMcpJudgeBundle.recordedBrowserRuntime.probePresentAfter, false);
  assert.equal(webMcpJudgeBundle.recordedBrowserRuntime.containsHealthInformation, false);
  assert.equal(webMcpJudgeBundle.recordedSelectionEval.passed, 55);
  assert.equal(webMcpJudgeBundle.recordedSelectionEval.failed, 0);
  assert.equal(webMcpJudgeBundle.recordedSelectionEval.containsPatientData, false);
  assert.equal(webMcpJudgeBundle.recordedSelectionEval.storesModelContentOrThinking, false);
  assert.doesNotMatch(JSON.stringify(webMcpJudgeBundle), /rawText|maskedText|confirmedProfile|trialResult|toolArgument|toolOutput|promptContent/i);
});

test("spec crosswalk pins exact upstream clauses without overstating declarative conformance", () => {
  assert.equal(webMcpSpecCrosswalk.length, 8);
  assert.equal(new Set(webMcpSpecCrosswalk.map((item) => item.id)).size, 8);
  assert.equal(webMcpSpecCrosswalkBundle.summary.implemented, 7);
  assert.equal(webMcpSpecCrosswalkBundle.summary.explainerAligned, 1);
  assert.equal(webMcpSpecCrosswalkBundle.summary.claimedNormativeDeclarativeConformance, false);
  assert.equal(webMcpSpecCrosswalk.every((item) => item.specUrl.startsWith("https://webmachinelearning.github.io/webmcp/#") && item.evidence.length > 0), true);
  const declarative = webMcpSpecCrosswalk.find((item) => item.id === "S-08");
  assert.equal(declarative?.status, "explainer_aligned");
  assert.match(declarative?.standardState ?? "", /explicitly TODO/i);
  assert.match(declarative?.secondarySourceUrl ?? "", /declarative-api-explainer\.md/);
  assert.equal(webMcpSpecCrosswalkBundle.privacyBoundary.containsHealthInformation, false);
  for (const item of webMcpSpecCrosswalk) {
    for (const evidence of item.evidence) assert.equal(existsSync(evidence), true, `${item.id} evidence path does not exist: ${evidence}`);
  }
  assert.doesNotMatch(JSON.stringify(webMcpSpecCrosswalkBundle), /rawText|maskedText|confirmedProfile|trialResult|toolArgument|toolOutput|promptContent/i);
});

test("conformance matrix has unique evidence IDs and an explicit unclaimed Inspector gate", () => {
  assert.equal(new Set(webMcpConformanceMatrix.map((item) => item.id)).size, webMcpConformanceMatrix.length);
  assert.equal(webMcpConformanceMatrix.filter((item) => item.evidenceClass === "repository_verified").length, 7);
  assert.equal(webMcpConformanceMatrix.filter((item) => item.evidenceClass === "recorded_model_eval").length, 1);
  assert.equal(webMcpConformanceMatrix.filter((item) => item.evidenceClass === "manual_gate").length, 1);
  assert.match(webMcpConformanceMatrix.find((item) => item.evidenceClass === "manual_gate")?.implementation ?? "", /must still verify/i);
  assert.equal(webMcpConformanceMatrix.every((item) => item.evidence.length > 0), true);
  for (const item of webMcpConformanceMatrix) {
    for (const evidence of item.evidence.filter((entry) => !entry.startsWith("https://"))) {
      assert.equal(existsSync(evidence), true, `${item.id} evidence path does not exist: ${evidence}`);
    }
  }
});

test("capability inventory has one declarative and seven unique imperative names", () => {
  assert.equal(new Set(webMcpCapabilityInventory.map((tool) => tool.name)).size, 8);
  assert.equal(webMcpCapabilityInventory.filter((tool) => tool.kind === "Declarative").length, 1);
  assert.equal(webMcpCapabilityInventory.filter((tool) => tool.kind === "Imperative").length, 7);
  assert.equal(webMcpCapabilityInventory.some((tool) => /send|enroll|book|consent|treatment_change/.test(tool.name)), false);
});
