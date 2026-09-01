import assert from "node:assert/strict";
import test from "node:test";
import { webMcpCapabilityInventory } from "../lib/webmcp/capabilityInventory.ts";
import { webMcpConformanceMatrix, webMcpJudgeBundle } from "../lib/webmcp/judgeBundle.ts";

test("judge bundle is deterministic, source-linked, and contains no workflow payload", () => {
  assert.equal(webMcpJudgeBundle.schemaVersion, "1.0");
  assert.equal(webMcpJudgeBundle.artifactClass, "competition_evidence_not_protocol_metadata");
  assert.equal(webMcpJudgeBundle.privacyBoundary.containsHealthInformation, false);
  assert.equal(webMcpJudgeBundle.privacyBoundary.readsCurrentBrowserSession, false);
  assert.equal(webMcpJudgeBundle.privacyBoundary.readsMedicalWorkflowState, false);
  assert.equal(webMcpJudgeBundle.summary.declarativeTools, 1);
  assert.equal(webMcpJudgeBundle.summary.imperativeTools, 7);
  assert.equal(webMcpJudgeBundle.summary.writeOrEnrollmentTools, 0);
  assert.equal(webMcpJudgeBundle.recordedSelectionEval.passed, 55);
  assert.equal(webMcpJudgeBundle.recordedSelectionEval.failed, 0);
  assert.equal(webMcpJudgeBundle.recordedSelectionEval.containsPatientData, false);
  assert.equal(webMcpJudgeBundle.recordedSelectionEval.storesModelContentOrThinking, false);
  assert.doesNotMatch(JSON.stringify(webMcpJudgeBundle), /rawText|maskedText|confirmedProfile|trialResult|toolArgument|toolOutput|promptContent/i);
});

test("conformance matrix has unique evidence IDs and an explicit unclaimed Inspector gate", () => {
  assert.equal(new Set(webMcpConformanceMatrix.map((item) => item.id)).size, webMcpConformanceMatrix.length);
  assert.equal(webMcpConformanceMatrix.filter((item) => item.evidenceClass === "repository_verified").length, 7);
  assert.equal(webMcpConformanceMatrix.filter((item) => item.evidenceClass === "recorded_model_eval").length, 1);
  assert.equal(webMcpConformanceMatrix.filter((item) => item.evidenceClass === "manual_gate").length, 1);
  assert.match(webMcpConformanceMatrix.find((item) => item.evidenceClass === "manual_gate")?.implementation ?? "", /must still verify/i);
  assert.equal(webMcpConformanceMatrix.every((item) => item.evidence.length > 0), true);
});

test("capability inventory has one declarative and seven unique imperative names", () => {
  assert.equal(new Set(webMcpCapabilityInventory.map((tool) => tool.name)).size, 8);
  assert.equal(webMcpCapabilityInventory.filter((tool) => tool.kind === "Declarative").length, 1);
  assert.equal(webMcpCapabilityInventory.filter((tool) => tool.kind === "Imperative").length, 7);
  assert.equal(webMcpCapabilityInventory.some((tool) => /send|enroll|book|consent|treatment_change/.test(tool.name)), false);
});
