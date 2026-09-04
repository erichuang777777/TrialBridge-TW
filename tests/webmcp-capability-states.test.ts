/// <reference types="webmcp-types" />
import assert from "node:assert/strict";
import test from "node:test";
import type { TrialMatch } from "../lib/matching/engine.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";
import { webMcpCapabilityStateBundle, webMcpCapabilityStates } from "../lib/webmcp/capabilityStates.ts";
import { buildTrialBridgeTools } from "../lib/webmcp/tools.ts";
import { organizeSummaryFormContractCore, publicTrialFormContractCore } from "../lib/webmcp/toolContractCore.ts";

const syntheticDraft = profileDraftSchema.parse({
  schemaVersion: "1.0", language: "en", subjectRole: "patient",
  facts: [{ id: "fact_state_model", domain: "cancer_type", value: "synthetic cancer", displayZhHant: "虛構癌症", displayEn: "Synthetic cancer", source: "user_statement", confidence: 1, confirmed: false }],
  missingQuestions: [], safetyNote: "Synthetic capability-state fixture only.",
});
const syntheticProfile = confirmProfile(syntheticDraft, {}, "patient", "2026-09-02T00:00:00.000Z");
const syntheticMatches = [
  { trial: { canonicalId: "synthetic:state-1" } },
  { trial: { canonicalId: "synthetic:state-2" } },
] as TrialMatch[];

test("capability-state model exactly matches runtime tool construction", () => {
  for (const state of webMcpCapabilityStates) {
    const actual = buildTrialBridgeTools({
      profile: state.confirmedContext ? syntheticProfile : undefined,
      matches: syntheticMatches,
      sensitiveConsent: state.visiblePermission,
      agentIntake: state.intakePermission ? { submit: async () => ({ state: "unavailable" as const, reason: "state model" }) } : undefined,
      shortlistedTrialIds: syntheticMatches.slice(0, state.shortlistSelections).map((match) => match.trial.canonicalId),
    }).map((tool) => tool.name);
    assert.deepEqual(actual, [...state.activeImperativeToolNames], state.key);
  }
  assert.deepEqual(webMcpCapabilityStates.map((state) => state.activeImperativeToolNames.length), [2, 3, 2, 6, 7]);
  assert.deepEqual(webMcpCapabilityStates[1].activeImperativeToolNames.at(-1), "organize_deidentified_summary");
});

test("state simulator remains static, no-PHI evidence with a visible declarative path", () => {
  assert.deepEqual(webMcpCapabilityStateBundle.declarativeToolNames, [publicTrialFormContractCore.name, organizeSummaryFormContractCore.name]);
  assert.equal(webMcpCapabilityStateBundle.imperativeToolCount, 8);
  assert.equal(webMcpCapabilityStateBundle.privacyBoundary.containsHealthInformation, false);
  assert.equal(webMcpCapabilityStateBundle.privacyBoundary.executesTools, false);
  assert.equal(webMcpCapabilityStateBundle.privacyBoundary.readsCurrentBrowserSession, false);
  assert.match(webMcpCapabilityStateBundle.evidenceBoundary, /does not prove current-browser registration/i);
  assert.doesNotMatch(JSON.stringify(webMcpCapabilityStateBundle), /"(?:rawText|maskedText|medicalNote|profileFact|trialResult|prompt|argument|output)"\s*:/i);
});
