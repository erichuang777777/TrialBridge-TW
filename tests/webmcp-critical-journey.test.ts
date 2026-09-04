import assert from "node:assert/strict";
import test from "node:test";
import { webMcpCriticalJourney } from "../lib/webmcp/criticalJourney.ts";

test("critical user journey starts public, protects intake, and ends with human-controlled drafts", () => {
  assert.equal(webMcpCriticalJourney.steps.length, 5);
  assert.deepEqual(webMcpCriticalJourney.steps[0].tools, ["search_public_trial_form", "search_public_cancer_trials"]);
  assert.deepEqual(webMcpCriticalJourney.steps[1].tools, ["organize_summary_form", "organize_deidentified_summary"]);
  assert.match(webMcpCriticalJourney.steps[1].state, /gated intake/i);
  assert.deepEqual(webMcpCriticalJourney.steps.at(-1)?.tools, ["compare_shortlisted_trials", "draft_trial_outreach", "draft_trial_discussion_brief"]);
  assert.equal(webMcpCriticalJourney.steps.every((step) => step.goal.length > 0 && step.siteReaction.length > 0 && step.recovery.length > 0), true);
  assert.match(webMcpCriticalJourney.boundary, /no tool can enroll, send, book, consent, or change treatment/i);
});
