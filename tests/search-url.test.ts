import assert from "node:assert/strict";
import test from "node:test";
import { createPublicTrialSearchPath, defaultPublicTrialCondition, parsePublicTrialSearchParams } from "../lib/trials/searchUrl.ts";

test("public trial search URLs preserve a bilingual general condition and open-record choice", () => {
  assert.deepEqual(parsePublicTrialSearchParams("?condition=%E8%83%83%E7%99%8C&includeNotOpen=1"), {
    condition: "胃癌",
    includeNotOpen: true,
    hasExplicitCondition: true,
    rejectedCondition: false,
  });
  assert.equal(createPublicTrialSearchPath(" 胃癌 ", true), "/trials?condition=%E8%83%83%E7%99%8C&includeNotOpen=1");
});

test("unsafe, detailed, or malformed URL conditions are rejected without echoing them", () => {
  for (const condition of ["patient@example.com", "A123456789", "MRN: AB-1234", "x", `gastric cancer\nphone 0912-345-678`, "HER2-positive gastric cancer"]) {
    const state = parsePublicTrialSearchParams(`?condition=${encodeURIComponent(condition)}&includeNotOpen=1`);
    assert.equal(state.condition, defaultPublicTrialCondition);
    assert.equal(state.includeNotOpen, false);
    assert.equal(state.rejectedCondition, true);
    assert.throws(() => createPublicTrialSearchPath(condition, false), /curated general cancer condition/);
  }
});

test("an ordinary trials URL retains the neutral default without inventing query state", () => {
  assert.deepEqual(parsePublicTrialSearchParams(""), {
    condition: defaultPublicTrialCondition,
    includeNotOpen: false,
    hasExplicitCondition: false,
    rejectedCondition: false,
  });
});
