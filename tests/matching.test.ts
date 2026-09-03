import assert from "node:assert/strict";
import test from "node:test";
import { assessTrial, deriveConditionQuery } from "../lib/matching/engine.ts";
import { createOutreachDraft } from "../lib/matching/outreach.ts";
import { createTrialDiscussionBrief } from "../lib/matching/discussionBrief.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";
import { normalizeClinicalTrialsGovStudy } from "../lib/trials/adapters/clinicalTrialsGov.ts";
import { normalizeTfdaRecord } from "../lib/trials/adapters/tfda.ts";
import { ctgovFixture, tfdaFixture } from "./fixtures/registry.ts";

const draft = profileDraftSchema.parse({ schemaVersion: "1.0", language: "en", subjectRole: "patient", facts: [
  { id: "fact_cancer_1", domain: "cancer_type", value: "gastric cancer", displayZhHant: "胃癌", displayEn: "Gastric cancer", source: "masked_note", confidence: 0.9, confirmed: false },
  { id: "fact_age_1", domain: "age_band", value: "62 years", displayZhHant: "62 歲", displayEn: "62 years old", source: "user_statement", confidence: 1, confirmed: false },
], missingQuestions: [], safetyNote: "Draft only, not medical advice or eligibility." });
const profile = confirmProfile(draft, {}, "patient", "2026-09-01T00:00:00.000Z");
const trial = normalizeClinicalTrialsGovStudy(ctgovFixture, "2026-09-01T00:00:00.000Z");

test("matching requires and traces patient-confirmed cancer facts", () => {
  assert.equal(deriveConditionQuery(profile), "gastric cancer");
  const match = assessTrial(profile, trial);
  assert.equal(match.status, "needs_information");
  assert.deepEqual(match.assessments[0].patientFactIds, ["fact_cancer_1"]);
  assert.equal(match.assessments[0].registryField, "conditions/title");
  assert.equal(match.assessments.find((item) => item.key === "age")?.outcome, "possibly_met");
  assert.deepEqual(match.assessments.map((item) => item.key), ["condition", "recruitment", "age", "sex", "location", "eligibility_details"]);
  assert.equal(match.assessments.find((item) => item.key === "location")?.outcome, "missing");
  assert.equal(match.assessments.find((item) => item.key === "eligibility_details")?.outcome, "missing");
});

test("outreach is an unsent bilingual draft without direct identifiers", () => {
  const draftMessage = createOutreachDraft(profile, trial, "zh-Hant");
  assert.equal(draftMessage.sent, false);
  assert.match(draftMessage.body, /尚未寄出/);
  assert.match(draftMessage.body, /胃癌/);
  assert.equal(draftMessage.body.includes("patient@example.com"), false);
});

test("discussion brief separates registry facts, uncertainty, and patient questions without sending", () => {
  const match = assessTrial(profile, trial);
  const brief = createTrialDiscussionBrief(profile, [match], "en", "2026-09-02T00:00:00.000Z");
  assert.equal(brief.sent, false);
  assert.equal(brief.containsConfirmedHealthInformation, true);
  assert.equal(brief.trialCount, 1);
  assert.match(brief.markdown, /Care-team brief/);
  assert.match(brief.markdown, /Person-facing discussion handout/);
  assert.match(brief.markdown, /Evidence quality, treatment benefit, harms, and guideline alignment were \*\*not assessed\*\*/);
  assert.match(brief.markdown, /NCT00000001/);
  assert.match(brief.markdown, /Gastric cancer/);
  assert.match(brief.markdown, /What this brief does not prove/);
  assert.match(brief.markdown, /Questions for your care or study team/);
  assert.match(brief.markdown, /Detailed criterion wording signals/);
  assert.match(brief.markdown, /does not affect overall status/);
  assert.doesNotMatch(brief.markdown, /study@example\.test/);
});

test("discussion brief is capped at five current comparisons and supports Traditional Chinese", () => {
  const match = assessTrial(profile, trial);
  const matches = Array.from({ length: 6 }, (_, index) => ({ ...match, trial: { ...match.trial, canonicalId: `trial-${index}` } }));
  const brief = createTrialDiscussionBrief(profile, matches, "zh-Hant", "2026-09-02T00:00:00.000Z");
  assert.equal(brief.trialCount, 5);
  assert.match(brief.markdown, /照護團隊摘要/);
  assert.match(brief.markdown, /這份摘要不能證明什麼/);
  assert.throws(() => createTrialDiscussionBrief(profile, [], "en"), /At least one current trial comparison/);
});

test("Taiwan and Asia travel preference aligns with an Asia-tier trial", () => {
  const travelDraft = profileDraftSchema.parse({
    ...draft,
    facts: [...draft.facts, {
      id: "fact_travel_1", domain: "travel_preference", value: "Taiwan and Asia",
      displayZhHant: "台灣與亞洲", displayEn: "Taiwan and Asia", source: "user_statement",
      confidence: 1, confirmed: false,
    }],
  });
  const travelProfile = confirmProfile(travelDraft, {}, "patient", "2026-09-01T00:00:00.000Z");
  const asiaTrial = { ...trial, regionTier: "asia" as const };
  assert.equal(assessTrial(travelProfile, asiaTrial).assessments.find((item) => item.key === "location")?.outcome, "possibly_met");
});

test("a Taiwan TFDA source without a published site remains missing for travel comparison", () => {
  const travelDraft = profileDraftSchema.parse({
    ...draft,
    facts: [...draft.facts, {
      id: "fact_travel_tfda", domain: "travel_preference", value: "Taiwan",
      displayZhHant: "台灣", displayEn: "Taiwan", source: "user_statement",
      confidence: 1, confirmed: false,
    }],
  });
  const travelProfile = confirmProfile(travelDraft, {}, "patient", "2026-09-01T00:00:00.000Z");
  const tfdaOnly = normalizeTfdaRecord(tfdaFixture, "2026-09-01T00:00:00.000Z");
  const location = assessTrial(travelProfile, tfdaOnly).assessments.find((item) => item.key === "location");
  assert.equal(location?.outcome, "missing");
  assert.match(location?.explanationEn ?? "", /source region is not treated as a recruiting location/i);
});

test("closed recruitment is shown separately and does not create a clinical mismatch by itself", () => {
  const openMatch = assessTrial(profile, trial);
  const closedMatch = assessTrial(profile, {
    ...trial,
    recruitment: { raw: "COMPLETED", category: "not_open", acceptingNewParticipants: false },
  });
  assert.equal(closedMatch.status, openMatch.status);
  assert.equal(closedMatch.assessments.find((item) => item.key === "recruitment")?.outcome, "possibly_not_met");
});

test("a female patient does not pass a male-only trial through substring matching", () => {
  const sexDraft = profileDraftSchema.parse({
    ...draft,
    facts: [...draft.facts, { id: "fact_sex_1", domain: "sex_eligibility", value: "female", displayZhHant: "女性", displayEn: "Female", source: "user_statement", confidence: 1, confirmed: false }],
  });
  const sexProfile = confirmProfile(sexDraft, {}, "patient", "2026-09-01T00:00:00.000Z");
  const maleOnly = { ...trial, eligibility: { ...trial.eligibility, sex: "MALE" } };
  const femaleOnly = { ...trial, eligibility: { ...trial.eligibility, sex: "FEMALE" } };
  assert.equal(assessTrial(sexProfile, maleOnly).assessments.find((item) => item.key === "sex")?.outcome, "possibly_not_met");
  assert.equal(assessTrial(sexProfile, maleOnly).status, "unlikely_based_on_public_record");
  assert.equal(assessTrial(sexProfile, femaleOnly).assessments.find((item) => item.key === "sex")?.outcome, "possibly_met");
  assert.equal(assessTrial(sexProfile, trial).assessments.find((item) => item.key === "sex")?.outcome, "possibly_met");
});

test("Traditional Chinese condition terms overlap registry titles without word boundaries", () => {
  const cjkDraft = profileDraftSchema.parse({
    ...draft,
    facts: [{ id: "fact_cancer_2", domain: "cancer_type", value: "非小細胞肺癌", displayZhHant: "非小細胞肺癌", displayEn: "Non-small cell lung cancer", source: "masked_note", confidence: 0.9, confirmed: false }],
  });
  const cjkProfile = confirmProfile(cjkDraft, {}, "patient", "2026-09-01T00:00:00.000Z");
  const tfdaTrial = normalizeTfdaRecord(tfdaFixture, "2026-09-01T00:00:00.000Z");
  const lungTrial = { ...tfdaTrial, title: "肺癌臨床試驗", officialTitle: undefined, conditions: ["肺癌"] };
  const condition = assessTrial(cjkProfile, lungTrial).assessments.find((item) => item.key === "condition");
  assert.equal(condition?.outcome, "possibly_met");
  const breastTrial = { ...tfdaTrial, title: "乳癌臨床試驗", officialTitle: undefined, conditions: ["乳癌"] };
  assert.equal(assessTrial(cjkProfile, breastTrial).assessments.find((item) => item.key === "condition")?.outcome, "possibly_not_met");
});
