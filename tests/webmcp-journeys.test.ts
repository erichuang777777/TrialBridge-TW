import assert from "node:assert/strict";
import test from "node:test";
import { webMcpJourneyCases } from "../evals/webmcp-journeys.ts";

const publicTools = new Set(["trialbridge_method", "search_public_cancer_trials"]);
const contextualTools = new Set(["review_trial_followups", "explain_confirmed_matches", "draft_trial_outreach", "draft_trial_discussion_brief"]);

test("WebMCP journey eval manifest covers direct, ambiguous, recovery, and forbidden intents", () => {
  assert.equal(webMcpJourneyCases.length >= 10, true);
  assert.deepEqual(new Set(webMcpJourneyCases.map((item) => item.intent)), new Set(["direct", "ambiguous", "recovery", "forbidden"]));
  assert.equal(new Set(webMcpJourneyCases.map((item) => item.id)).size, webMcpJourneyCases.length);
  assert.equal(webMcpJourneyCases.every((item) => item.prompt.trim().length >= 12 && item.expectedBoundary.trim().length >= 12), true);
});

test("journey expectations use only tools available in each state", () => {
  for (const item of webMcpJourneyCases) {
    const available = item.state === "public" ? publicTools : new Set([...publicTools, ...contextualTools]);
    assert.equal(item.expectedTools.every((name) => available.has(name)), true, item.id);
    assert.equal(Object.keys(item.expectedArguments ?? {}).every((name) => item.expectedTools.includes(name)), true, item.id);
    assert.equal(item.intent === "forbidden" ? item.expectedTools.length === 0 : item.expectedTools.length > 0, true, item.id);
  }
});

test("journey manifest keeps consequential and raw-note requests outside WebMCP authority", () => {
  const forbidden = webMcpJourneyCases.filter((item) => item.intent === "forbidden");
  assert.equal(forbidden.some((item) => /enroll/i.test(item.prompt)), true);
  assert.equal(forbidden.some((item) => /原始病歷/.test(item.prompt)), true);
  assert.equal(forbidden.every((item) => item.expectedTools.length === 0), true);
});
