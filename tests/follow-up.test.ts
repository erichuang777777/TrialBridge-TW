import assert from "node:assert/strict";
import test from "node:test";
import { appendConfirmedFollowUpAnswers, derivePreMatchQuestions, FOLLOW_UP_UNKNOWN } from "../lib/matching/followUp.ts";
import { assessTrial } from "../lib/matching/engine.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";
import { normalizeClinicalTrialsGovStudy } from "../lib/trials/adapters/clinicalTrialsGov.ts";
import { ctgovFixture } from "./fixtures/registry.ts";

const baseDraft = profileDraftSchema.parse({
  schemaVersion: "1.0", language: "en", subjectRole: "patient",
  facts: [{ id: "fact_cancer_followup", domain: "cancer_type", value: "gastric cancer", displayZhHant: "胃癌", displayEn: "Gastric cancer", source: "user_statement", confidence: 1, confirmed: false }],
  missingQuestions: [], safetyNote: "Synthetic test data only.",
});
const baseProfile = confirmProfile(baseDraft, {}, "patient", "2026-09-01T00:00:00.000Z");

test("candidate trial requirements produce deduplicated questions before results", () => {
  const trial = normalizeClinicalTrialsGovStudy(ctgovFixture, "2026-09-01T00:00:00.000Z");
  const questions = derivePreMatchQuestions(baseProfile, [trial, { ...trial, canonicalId: "ctgov:second" }]);
  assert.equal(questions.some((question) => question.domain === "age_band"), true);
  assert.equal(questions.some((question) => question.domain === "travel_preference"), true);
  assert.equal(questions.some((question) => question.domain === "stage"), true);
  assert.equal(questions.find((question) => question.domain === "stage")?.trialCount, 2);
  assert.equal(new Set(questions.map((question) => question.domain)).size, questions.length);
});

test("confirmed follow-up answers are minimized while unknown answers add no fact", () => {
  const trial = normalizeClinicalTrialsGovStudy(ctgovFixture, "2026-09-01T00:00:00.000Z");
  const questions = derivePreMatchQuestions(baseProfile, [trial]);
  const answers = Object.fromEntries(questions.map((question) => [question.id, FOLLOW_UP_UNKNOWN]));
  const ageQuestion = questions.find((question) => question.domain === "age_band")!;
  answers[ageQuestion.id] = "62 years; email patient@example.com";
  const updated = appendConfirmedFollowUpAnswers(baseProfile, questions, answers, "2026-09-01T00:10:00.000Z");
  assert.equal(updated.facts.length, baseProfile.facts.length + 1);
  assert.equal(updated.facts.at(-1)?.domain, "age_band");
  assert.doesNotMatch(updated.facts.at(-1)?.value ?? "", /patient@example\.com/);
  assert.equal(updated.facts.some((fact) => fact.domain === "travel_preference"), false);
});

test("confirmed prior intervention overlap is a traceable potential exclusion signal", () => {
  const raw = structuredClone(ctgovFixture);
  raw.protocolSection.eligibilityModule.eligibilityCriteria = "Inclusion Criteria: Adults with advanced gastric cancer. Exclusion Criteria: Prior FOLFOX treatment is excluded.";
  const trial = normalizeClinicalTrialsGovStudy(raw, "2026-09-01T00:00:00.000Z");
  assert.match(trial.eligibility.exclusion ?? "", /FOLFOX/);
  const priorDraft = profileDraftSchema.parse({ ...baseDraft, facts: [...baseDraft.facts, { id: "fact_prior_folfox", domain: "prior_therapy", value: "mFOLFOX6", displayZhHant: "mFOLFOX6", displayEn: "mFOLFOX6", source: "user_statement", confidence: 1, confirmed: false }] });
  const priorProfile = confirmProfile(priorDraft, {}, "patient", "2026-09-01T00:00:00.000Z");
  const match = assessTrial(priorProfile, trial);
  assert.equal(match.status, "unlikely_based_on_public_record");
  assert.equal(match.potentialExclusions.length, 1);
  assert.deepEqual(match.potentialExclusions[0].matchedTerms, ["mfolfox6"]);
  assert.equal(match.assessments.find((assessment) => assessment.key === "eligibility_details")?.outcome, "possibly_not_met");
  assert.match(match.potentialExclusions[0].registryExcerpt, /FOLFOX/);
});

test("complete public data without a known mismatch is separated from truly missing information", () => {
  const trial = normalizeClinicalTrialsGovStudy(ctgovFixture, "2026-09-01T00:00:00.000Z");
  const completeDraft = profileDraftSchema.parse({ ...baseDraft, facts: [
    ...baseDraft.facts,
    { id: "fact_complete_age", domain: "age_band", value: "62 years", displayZhHant: "62 歲", displayEn: "62 years", source: "user_statement", confidence: 1, confirmed: false },
    { id: "fact_complete_travel", domain: "travel_preference", value: "Taiwan and Asia", displayZhHant: "台灣與亞洲", displayEn: "Taiwan and Asia", source: "user_statement", confidence: 1, confirmed: false },
    { id: "fact_complete_stage", domain: "stage", value: "advanced", displayZhHant: "晚期", displayEn: "Advanced", source: "user_statement", confidence: 1, confirmed: false },
  ] });
  const completeProfile = confirmProfile(completeDraft, {}, "patient", "2026-09-01T00:00:00.000Z");
  const match = assessTrial(completeProfile, trial);
  assert.equal(match.assessments.some((assessment) => assessment.outcome === "missing"), false);
  assert.equal(match.status, "needs_review");
});
