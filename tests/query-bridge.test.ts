import assert from "node:assert/strict";
import test from "node:test";
import { cancerCoverage } from "../evals/cancer-coverage.ts";
import { bilingualCancerQueryLexicon, bilingualCancerQueryLexiconVersion, createRegistryQueryPlan } from "../lib/trials/queryBridge.ts";

test("bilingual query lexicon covers every declared cancer group exactly once", () => {
  assert.equal(bilingualCancerQueryLexicon.length, 19);
  assert.deepEqual(
    bilingualCancerQueryLexicon.map((entry) => entry.cancerGroup).sort(),
    cancerCoverage.map((entry) => entry.cancerGroup).sort(),
  );
  assert.equal(new Set(bilingualCancerQueryLexicon.map((entry) => entry.cancerGroup)).size, bilingualCancerQueryLexicon.length);
  assert.match(bilingualCancerQueryLexiconVersion, /^\d{4}-\d{2}-\d{2}$/);
  const termOwners = new Map<string, string>();
  for (const entry of bilingualCancerQueryLexicon) {
    for (const term of [entry.en, entry.zhHant, ...entry.aliases]) {
      const normalized = term.toLocaleLowerCase("en").replace(/[‐‑‒–—-]/g, " ").replace(/\s+/g, " ").trim();
      assert.equal(termOwners.get(normalized) ?? entry.cancerGroup, entry.cancerGroup, `ambiguous lexicon term: ${term}`);
      termOwners.set(normalized, entry.cancerGroup);
    }
    const plan = createRegistryQueryPlan(entry.zhHant);
    assert.equal(plan.canonicalGroup, entry.cancerGroup);
    assert.deepEqual(plan.registryConditions, { TFDA: entry.zhHant, "ClinicalTrials.gov": entry.en });
  }
});

test("Traditional Chinese cancer terms bridge to a Taiwan and overseas registry query", () => {
  const plan = createRegistryQueryPlan("胃癌");
  assert.equal(plan.strategy, "curated_bilingual_cancer_lexicon");
  assert.equal(plan.canonicalGroup, "gastric");
  assert.deepEqual(plan.registryConditions, { TFDA: "胃癌", "ClinicalTrials.gov": "gastric cancer" });
  assert.match(plan.limitation, /not a clinical translation/i);
});

test("English aliases bridge back to the Traditional Chinese TFDA term", () => {
  const plan = createRegistryQueryPlan("Stomach Cancer");
  assert.equal(plan.canonicalGroup, "gastric");
  assert.deepEqual(plan.registryConditions, { TFDA: "胃癌", "ClinicalTrials.gov": "gastric cancer" });
});

test("unrecognized detailed conditions pass through without inferred subtype or biomarker", () => {
  const plan = createRegistryQueryPlan("HER2-positive gastric cancer");
  assert.equal(plan.strategy, "pass_through");
  assert.equal(plan.canonicalGroup, undefined);
  assert.deepEqual(plan.registryConditions, { TFDA: "HER2-positive gastric cancer", "ClinicalTrials.gov": "HER2-positive gastric cancer" });
  assert.match(plan.limitation, /without inferring a histology, subtype, stage, or biomarker/i);
  for (const ambiguous of ["uterine cancer", "Hodgkin lymphoma", "hepatocellular carcinoma", "soft tissue sarcoma"]) {
    const ambiguousPlan = createRegistryQueryPlan(ambiguous);
    assert.equal(ambiguousPlan.strategy, "pass_through", ambiguous);
    assert.deepEqual(ambiguousPlan.registryConditions, { TFDA: ambiguous, "ClinicalTrials.gov": ambiguous });
  }
});
