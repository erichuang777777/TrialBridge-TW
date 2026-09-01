import assert from "node:assert/strict";
import test from "node:test";
import { maxShortlistTrials, resolveShortlistedMatches, toggleShortlistTrial } from "../lib/matching/shortlist.ts";
import type { TrialMatch } from "../lib/matching/engine.ts";

test("shortlist is user-controlled, ordered, removable, and capped at three", () => {
  let selected: string[] = [];
  for (const id of ["trial-1", "trial-2", "trial-3", "trial-4"]) selected = toggleShortlistTrial(selected, id);
  assert.equal(maxShortlistTrials, 3);
  assert.deepEqual(selected, ["trial-1", "trial-2", "trial-3"]);
  selected = toggleShortlistTrial(selected, "trial-2");
  assert.deepEqual(selected, ["trial-1", "trial-3"]);
  selected = toggleShortlistTrial(selected, "trial-4");
  assert.deepEqual(selected, ["trial-1", "trial-3", "trial-4"]);
});

test("shortlist resolution keeps visible order, removes duplicates, and drops stale IDs", () => {
  const matches = ["trial-1", "trial-2", "trial-3"].map((canonicalId) => ({ trial: { canonicalId } })) as TrialMatch[];
  const resolved = resolveShortlistedMatches(matches, ["trial-2", "stale", "trial-2", "trial-1"]);
  assert.deepEqual(resolved.map((match) => match.trial.canonicalId), ["trial-2", "trial-1"]);
});
