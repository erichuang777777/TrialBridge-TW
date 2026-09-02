import assert from "node:assert/strict";
import test from "node:test";
import { splitEligibilityCriteria } from "../lib/trials/eligibility.ts";

test("eligibility parser preserves a standalone labelled inclusion section", () => {
  const parsed = splitEligibilityCriteria("Inclusion Criteria: Stage IV gastric adenocarcinoma.");
  assert.equal(parsed.inclusion, "Stage IV gastric adenocarcinoma.");
  assert.equal(parsed.exclusion, undefined);
  assert.match(parsed.combined ?? "", /Inclusion Criteria/);
});

test("eligibility parser separates labelled inclusion and exclusion sections", () => {
  const parsed = splitEligibilityCriteria("Inclusion Criteria: HER2-negative disease. Exclusion Criteria: Prior FOLFOX.");
  assert.equal(parsed.inclusion, "HER2-negative disease.");
  assert.equal(parsed.exclusion, "Prior FOLFOX.");
});

test("eligibility parser keeps unlabelled criteria combined without inventing a section role", () => {
  const parsed = splitEligibilityCriteria("Adults with advanced gastric cancer.");
  assert.equal(parsed.inclusion, undefined);
  assert.equal(parsed.exclusion, undefined);
  assert.equal(parsed.combined, "Adults with advanced gastric cancer.");
});
