/// <reference types="webmcp-types" />
import assert from "node:assert/strict";
import test from "node:test";
import { buildTrialBridgeTools } from "../lib/webmcp/tools.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";

const draft = profileDraftSchema.parse({ schemaVersion: "1.0", language: "en", subjectRole: "patient", facts: [{ id: "fact_cancer_1", domain: "cancer_type", value: "gastric cancer", displayZhHant: "胃癌", displayEn: "Gastric cancer", source: "user_statement", confidence: 1, confirmed: false }], missingQuestions: [], safetyNote: "Draft only." });
const profile = confirmProfile(draft, {}, "patient", "2026-09-01T00:00:00.000Z");

test("WebMCP exposes public tools without patient context and no write tools", () => {
  const tools = buildTrialBridgeTools({ matches: [], sensitiveConsent: false });
  assert.deepEqual(tools.map((tool) => tool.name), ["trialbridge_method", "search_public_cancer_trials"]);
  assert.equal(tools.every((tool) => tool.annotations?.readOnlyHint), true);
  assert.equal(tools.some((tool) => /send|enroll|submit|book/i.test(tool.name)), false);
  assert.equal(tools.every((tool) => tool.name.length <= 30), true);
  assert.equal(JSON.stringify(tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))).toLowerCase().includes("rawnote"), false);
});

test("sensitive WebMCP tools register only with confirmed-profile consent", () => {
  assert.equal(buildTrialBridgeTools({ profile, matches: [], sensitiveConsent: false }).length, 2);
  const tools = buildTrialBridgeTools({ profile, matches: [], sensitiveConsent: true });
  assert.deepEqual(tools.slice(2).map((tool) => tool.name), ["explain_confirmed_matches", "draft_trial_outreach"]);
  assert.equal(tools.slice(1).every((tool) => tool.annotations?.untrustedContentHint), true);
});
