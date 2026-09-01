import assert from "node:assert/strict";
import test from "node:test";
import { assessTrial, deriveConditionQuery } from "../lib/matching/engine.ts";
import { createOutreachDraft } from "../lib/matching/outreach.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";
import { normalizeClinicalTrialsGovStudy } from "../lib/trials/adapters/clinicalTrialsGov.ts";
import { ctgovFixture } from "./fixtures/registry.ts";

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
