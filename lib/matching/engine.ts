import { confirmedProfileSchema, type ConfirmedProfile } from "../profile/schema.ts";
import { searchTrialRegistries } from "../trials/search.ts";
import type { NormalizedTrial, TrialRegistryAdapter } from "../trials/types.ts";

export type AssessmentOutcome = "possibly_met" | "possibly_not_met" | "unknown";
export interface CriterionAssessment {
  key: "condition" | "recruitment" | "age" | "sex" | "location";
  outcome: AssessmentOutcome;
  patientFactIds: string[];
  registryField: string;
  explanationZhHant: string;
  explanationEn: string;
}
export interface TrialMatch {
  trial: NormalizedTrial;
  status: "discuss" | "needs_information" | "unlikely_based_on_public_record";
  assessments: CriterionAssessment[];
}

function factsFor(profile: ConfirmedProfile, domains: string[]) {
  return profile.facts.filter((fact) => domains.includes(fact.domain));
}

function normalizedTerms(value: string): string[] {
  return value.toLocaleLowerCase("en").split(/[^\p{L}\p{N}+]+/u).filter((term) => term.length >= 2);
}

export function deriveConditionQuery(profileInput: ConfirmedProfile): string {
  const profile = confirmedProfileSchema.parse(profileInput);
  const facts = factsFor(profile, ["cancer_type", "primary_site", "histology"]);
  const query = facts.map((fact) => fact.value).join(" ").trim();
  if (!query) throw new Error("A confirmed cancer type or primary site is required before matching");
  return query.slice(0, 120);
}

function parseAge(profile: ConfirmedProfile): { age?: number; factIds: string[] } {
  const facts = factsFor(profile, ["age_band"]);
  const match = facts.map((fact) => fact.value.match(/\b(\d{1,3})\b/)).find(Boolean);
  return { age: match ? Number(match[1]) : undefined, factIds: facts.map((fact) => fact.id) };
}

function parseRegistryAge(value?: string): number | undefined {
  const match = value?.match(/\d{1,3}/);
  return match ? Number(match[0]) : undefined;
}

export function assessTrial(profileInput: ConfirmedProfile, trial: NormalizedTrial): TrialMatch {
  const profile = confirmedProfileSchema.parse(profileInput);
  const cancerFacts = factsFor(profile, ["cancer_type", "primary_site", "histology"]);
  const patientTerms = new Set(cancerFacts.flatMap((fact) => normalizedTerms(`${fact.value} ${fact.displayZhHant} ${fact.displayEn}`)));
  const trialTerms = new Set(normalizedTerms(`${trial.title} ${trial.conditions.join(" ")}`));
  const diseaseOverlap = [...patientTerms].some((term) => trialTerms.has(term));
  const age = parseAge(profile);
  const minimumAge = parseRegistryAge(trial.eligibility.minimumAge);
  const maximumAge = parseRegistryAge(trial.eligibility.maximumAge);
  const ageKnown = age.age !== undefined && (minimumAge !== undefined || maximumAge !== undefined);
  const ageWithin = !ageKnown || ((minimumAge === undefined || age.age! >= minimumAge) && (maximumAge === undefined || age.age! <= maximumAge));
  const sexFacts = factsFor(profile, ["sex_eligibility"]);
  const patientSex = sexFacts[0]?.value.toLocaleUpperCase("en");
  const registrySex = trial.eligibility.sex?.toLocaleUpperCase("en");
  const sexKnown = Boolean(patientSex && registrySex && registrySex !== "ALL");
  const sexWithin = !sexKnown || patientSex!.includes(registrySex!);

  const assessments: CriterionAssessment[] = [
    { key: "condition", outcome: diseaseOverlap ? "possibly_met" : "possibly_not_met", patientFactIds: cancerFacts.map((fact) => fact.id), registryField: "conditions/title", explanationZhHant: diseaseOverlap ? "確認摘要與登錄疾病用語有交集。" : "確認摘要與公開登錄疾病用語未找到明確交集。", explanationEn: diseaseOverlap ? "The confirmed summary overlaps the registered condition terms." : "No clear overlap was found with the public condition terms." },
    { key: "recruitment", outcome: trial.recruitment.acceptingNewParticipants ? "possibly_met" : "possibly_not_met", patientFactIds: [], registryField: "recruitment status", explanationZhHant: trial.recruitment.acceptingNewParticipants ? "公開登錄顯示目前或即將接受受試者。" : "公開登錄未顯示目前接受新受試者。", explanationEn: trial.recruitment.acceptingNewParticipants ? "The registry indicates current or upcoming participant acceptance." : "The registry does not indicate that new participants are being accepted." },
    { key: "age", outcome: !ageKnown ? "unknown" : ageWithin ? "possibly_met" : "possibly_not_met", patientFactIds: age.factIds, registryField: "minimumAge/maximumAge", explanationZhHant: !ageKnown ? "缺少可比較的年齡資料。" : ageWithin ? "確認年齡在公開年齡範圍內。" : "確認年齡不在公開年齡範圍內。", explanationEn: !ageKnown ? "Comparable age information is missing." : ageWithin ? "The confirmed age is within the public age range." : "The confirmed age is outside the public age range." },
    { key: "sex", outcome: !sexKnown ? "unknown" : sexWithin ? "possibly_met" : "possibly_not_met", patientFactIds: sexFacts.map((fact) => fact.id), registryField: "sex", explanationZhHant: !sexKnown ? "公開條件不需或目前無法比較性別條件。" : sexWithin ? "確認資料與公開性別條件一致。" : "確認資料與公開性別條件不一致。", explanationEn: !sexKnown ? "The public sex criterion does not require or allow a comparison." : sexWithin ? "The confirmed information matches the public sex criterion." : "The confirmed information does not match the public sex criterion." },
    { key: "location", outcome: trial.regionTier === "unknown" ? "unknown" : "possibly_met", patientFactIds: factsFor(profile, ["travel_preference"]).map((fact) => fact.id), registryField: "locations", explanationZhHant: `地區層級：${trial.regionTier}；未推估實際旅行時間。`, explanationEn: `Region tier: ${trial.regionTier}; travel time is not estimated.` },
  ];
  const status = assessments.some((item) => item.outcome === "possibly_not_met")
    ? "unlikely_based_on_public_record"
    : assessments.some((item) => item.outcome === "unknown") ? "needs_information" : "discuss";
  return { trial, status, assessments };
}

export async function matchConfirmedProfile(profileInput: ConfirmedProfile, adapters?: TrialRegistryAdapter[]) {
  const profile = confirmedProfileSchema.parse(profileInput);
  const condition = deriveConditionQuery(profile);
  const cancerFacts = factsFor(profile, ["cancer_type", "primary_site", "histology"]);
  const result = await searchTrialRegistries(
    { condition, pageSize: 30, includeNotOpen: false },
    adapters,
    {
      TFDA: cancerFacts.map((fact) => fact.displayZhHant).join(" ").slice(0, 120),
      "ClinicalTrials.gov": cancerFacts.map((fact) => fact.displayEn).join(" ").slice(0, 120),
    },
  );
  return { ...result, matches: result.trials.map((trial) => assessTrial(profile, trial)) };
}
