import assert from "node:assert/strict";
import test from "node:test";
import { assessTrial } from "../lib/matching/engine.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";
import { normalizeClinicalTrialsGovStudy } from "../lib/trials/adapters/clinicalTrialsGov.ts";
import { ctgovFixture } from "./fixtures/registry.ts";

function profileWithDetails(values: { subtype?: string; stage?: string; biomarker?: string; prior?: string }) {
  const facts = [
    { id: "fact_criterion_cancer", domain: "cancer_type", value: "gastric cancer", displayZhHant: "胃癌", displayEn: "Gastric cancer", source: "user_statement", confidence: 1, confirmed: false },
    ...(values.subtype ? [{ id: "fact_criterion_subtype", domain: "histology", value: values.subtype, displayZhHant: values.subtype, displayEn: values.subtype, source: "user_statement", confidence: 1, confirmed: false }] : []),
    ...(values.stage ? [{ id: "fact_criterion_stage", domain: "stage", value: values.stage, displayZhHant: values.stage, displayEn: values.stage, source: "user_statement", confidence: 1, confirmed: false }] : []),
    ...(values.biomarker ? [{ id: "fact_criterion_marker", domain: "biomarker", value: values.biomarker, displayZhHant: values.biomarker, displayEn: values.biomarker, source: "user_statement", confidence: 1, confirmed: false }] : []),
    ...(values.prior ? [{ id: "fact_criterion_prior", domain: "prior_therapy", value: values.prior, displayZhHant: values.prior, displayEn: values.prior, source: "user_statement", confidence: 1, confirmed: false }] : []),
  ];
  const draft = profileDraftSchema.parse({ schemaVersion: "1.0", language: "en", subjectRole: "patient", facts, missingQuestions: [], safetyNote: "Synthetic criterion evidence only." });
  return confirmProfile(draft, {}, "patient", "2026-09-02T00:00:00.000Z");
}

function trialWithCriteria(criteria: string) {
  const raw = structuredClone(ctgovFixture);
  raw.protocolSection.eligibilityModule.eligibilityCriteria = criteria;
  return normalizeClinicalTrialsGovStudy(raw, "2026-09-02T00:00:00.000Z");
}

test("detailed criterion evidence separates shared subtype, stage, biomarker, and prior-treatment terms", () => {
  const profile = profileWithDetails({ subtype: "adenocarcinoma", stage: "Stage IV", biomarker: "HER2-negative", prior: "FOLFOX" });
  const trial = trialWithCriteria("Inclusion Criteria: Histologically confirmed adenocarcinoma. Stage IV disease. HER2-negative tumor. Prior FOLFOX treatment required.");
  const match = assessTrial(profile, trial);
  assert.deepEqual(match.detailedCriteria.map((item) => item.key), ["subtype", "stage", "biomarker", "prior_treatment"]);
  assert.deepEqual(match.detailedCriteria.map((item) => item.state), ["shared_term", "shared_term", "shared_term", "shared_term"]);
  assert.equal(match.detailedCriteria.every((item) => item.affectsOverallStatus === false), true);
  assert.equal(match.detailedCriteria.every((item) => item.patientFactIds.length === 1), true);
  assert.equal(match.detailedCriteria.every((item) => item.registryField === "inclusion criteria"), true);
  assert.match(match.detailedCriteria.find((item) => item.key === "biomarker")?.registryExcerpt ?? "", /HER2-negative/);
});

test("explicit stage, subtype, and biomarker polarity differences remain review signals rather than final eligibility", () => {
  const profile = profileWithDetails({ subtype: "adenocarcinoma", stage: "Stage III", biomarker: "HER2-negative" });
  const trial = trialWithCriteria("Inclusion Criteria: Squamous cell carcinoma. Stage IV disease. HER2-positive tumor.");
  const match = assessTrial(profile, trial);
  assert.equal(match.detailedCriteria.find((item) => item.key === "subtype")?.state, "possible_difference");
  assert.equal(match.detailedCriteria.find((item) => item.key === "stage")?.state, "possible_difference");
  assert.equal(match.detailedCriteria.find((item) => item.key === "biomarker")?.state, "possible_difference");
  assert.equal(match.detailedCriteria.every((item) => item.affectsOverallStatus === false), true);
  assert.match(match.detailedCriteria.find((item) => item.key === "stage")?.explanationEn ?? "", /Confirm the exact staging system/i);
  assert.match(match.detailedCriteria.find((item) => item.key === "biomarker")?.explanationEn ?? "", /assay and threshold/i);
});

test("missing patient facts and missing public wording are distinguished", () => {
  const minimalProfile = profileWithDetails({});
  const detailedTrial = trialWithCriteria("Inclusion Criteria: Stage IV adenocarcinoma with HER2-positive disease after prior chemotherapy.");
  const patientMissing = assessTrial(minimalProfile, detailedTrial).detailedCriteria;
  assert.equal(patientMissing.every((item) => item.state === "missing"), true);
  assert.match(patientMissing.find((item) => item.key === "stage")?.explanationEn ?? "", /confirmed summary does not contain/i);

  const completeProfile = profileWithDetails({ subtype: "adenocarcinoma", stage: "Stage IV", biomarker: "HER2-positive", prior: "FOLFOX" });
  const noDetailTrial = trialWithCriteria("Adults with gastric cancer.");
  const registryMissing = assessTrial(completeProfile, noDetailTrial).detailedCriteria;
  assert.equal(registryMissing.every((item) => item.state === "missing"), true);
  assert.match(registryMissing.find((item) => item.key === "biomarker")?.explanationEn ?? "", /no comparable public biomarker wording/i);
});

test("confirmed intervention wording in public exclusion criteria stays traceable in both evidence layers", () => {
  const profile = profileWithDetails({ prior: "mFOLFOX6" });
  const trial = trialWithCriteria("Inclusion Criteria: Adults with gastric cancer. Exclusion Criteria: Prior FOLFOX treatment is excluded.");
  const match = assessTrial(profile, trial);
  const prior = match.detailedCriteria.find((item) => item.key === "prior_treatment");
  assert.equal(prior?.state, "possible_difference");
  assert.equal(prior?.registryField, "exclusion criteria");
  assert.deepEqual(prior?.patientFactIds, ["fact_criterion_prior"]);
  assert.match(prior?.registryExcerpt ?? "", /FOLFOX/);
  assert.equal(match.potentialExclusions.length, 1);
  assert.equal(match.status, "unlikely_based_on_public_record");
});

test("non-small-cell wording is not also normalized as small-cell", () => {
  const profile = profileWithDetails({ subtype: "non-small-cell carcinoma" });
  const trial = trialWithCriteria("Inclusion Criteria: Small-cell carcinoma is required.");
  const subtype = assessTrial(profile, trial).detailedCriteria.find((item) => item.key === "subtype");
  assert.equal(subtype?.state, "possible_difference");
});

test("unlabelled combined criteria never invent an inclusion alignment", () => {
  const profile = profileWithDetails({ subtype: "adenocarcinoma", stage: "Stage IV", biomarker: "HER2-negative", prior: "FOLFOX" });
  const match = assessTrial(profile, trialWithCriteria("Stage IV adenocarcinoma with HER2-negative disease after FOLFOX."));
  assert.deepEqual(match.detailedCriteria.map((item) => item.state), ["uncertain", "uncertain", "uncertain", "uncertain"]);
  assert.equal(match.detailedCriteria.every((item) => item.registryField === "eligibility criteria"), true);
});
