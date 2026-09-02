import { confirmedProfileSchema, type ConfirmedProfile } from "../profile/schema.ts";
import { searchTrialRegistries } from "../trials/search.ts";
import type { NormalizedTrial, TrialRegistryAdapter } from "../trials/types.ts";

export type AssessmentOutcome = "possibly_met" | "possibly_not_met" | "unknown" | "missing";
export interface CriterionAssessment {
  key: "condition" | "recruitment" | "age" | "sex" | "location" | "eligibility_details";
  outcome: AssessmentOutcome;
  patientFactIds: string[];
  registryField: string;
  explanationZhHant: string;
  explanationEn: string;
}
export interface TrialMatch {
  trial: NormalizedTrial;
  status: "discuss" | "needs_review" | "needs_information" | "unlikely_based_on_public_record";
  assessments: CriterionAssessment[];
  potentialExclusions: PotentialExclusionSignal[];
}
export interface PotentialExclusionSignal {
  patientFactId: string;
  confirmedIntervention: string;
  matchedTerms: string[];
  registryField: "exclusion criteria";
  registryExcerpt: string;
  explanationEn: string;
  explanationZhHant: string;
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

const interventionStopTerms = new Set(["cancer", "patient", "patients", "prior", "previous", "received", "treatment", "therapy", "chemotherapy", "radiotherapy", "immunotherapy", "current", "with", "without", "and", "the"]);

function potentialInterventionExclusions(profile: ConfirmedProfile, trial: NormalizedTrial): PotentialExclusionSignal[] {
  const exclusion = trial.eligibility.exclusion;
  if (!exclusion) return [];
  const exclusionTerms = new Set(normalizedTerms(exclusion));
  return factsFor(profile, ["prior_therapy", "current_therapy"]).flatMap((fact) => {
    const matchedPairs = normalizedTerms(fact.value).flatMap((term) => {
      if (term.length < 4 || interventionStopTerms.has(term)) return [];
      const registryTerm = [...exclusionTerms].find((candidate) => candidate === term || (Math.min(candidate.length, term.length) >= 5 && (candidate.includes(term) || term.includes(candidate))));
      return registryTerm ? [{ patientTerm: term, registryTerm }] : [];
    });
    const matchedTerms = [...new Set(matchedPairs.map((pair) => pair.patientTerm))];
    if (matchedTerms.length === 0) return [];
    const firstTerm = matchedPairs[0].registryTerm;
    const index = exclusion.toLocaleLowerCase("en").indexOf(firstTerm);
    const excerpt = exclusion.slice(Math.max(0, index - 80), Math.min(exclusion.length, index + firstTerm.length + 140));
    return [{
      patientFactId: fact.id,
      confirmedIntervention: fact.value,
      matchedTerms,
      registryField: "exclusion criteria" as const,
      registryExcerpt: excerpt,
      explanationEn: "A confirmed treatment term also appears in the public exclusion criteria. The study team must confirm the treatment name, timing, and context.",
      explanationZhHant: "已確認的治療用語也出現在公開排除條件中；仍需由試驗團隊確認治療名稱、時間與上下文。",
    }];
  });
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
  const sexUnrestricted = registrySex === "ALL";
  const sexKnown = Boolean(patientSex && registrySex && !sexUnrestricted);
  const sexWithin = sexKnown && patientSex!.includes(registrySex!);
  const travelFacts = factsFor(profile, ["travel_preference"]);
  const travelText = travelFacts.map((fact) => `${fact.value} ${fact.displayZhHant} ${fact.displayEn}`).join(" ").toLocaleLowerCase("en");
  const allowsWorldwide = /全球|world|global/.test(travelText);
  const allowsAsia = /亞洲|asia/.test(travelText);
  const allowsTaiwan = /台灣|taiwan/.test(travelText);
  const locationOutcome: AssessmentOutcome = trial.regionTier === "unknown" || travelFacts.length === 0
    ? "missing"
    : allowsWorldwide
      ? "possibly_met"
      : allowsAsia
        ? ["taiwan", "asia"].includes(trial.regionTier) ? "possibly_met" : "possibly_not_met"
        : allowsTaiwan
          ? trial.regionTier === "taiwan" ? "possibly_met" : "possibly_not_met"
          : "unknown";
  const eligibilityFacts = factsFor(profile, ["stage", "disease_extent", "biomarker", "prior_therapy", "current_therapy", "performance_status", "organ_function"]);
  const registryEligibility = [trial.eligibility.combined, trial.eligibility.inclusion, trial.eligibility.exclusion].filter(Boolean).join(" ");
  const potentialExclusions = potentialInterventionExclusions(profile, trial);
  const eligibilityOutcome: AssessmentOutcome = potentialExclusions.length > 0 ? "possibly_not_met" : eligibilityFacts.length === 0 || !registryEligibility ? "missing" : "unknown";
  const recruitmentOutcome: AssessmentOutcome = trial.recruitment.category === "open"
    ? "possibly_met"
    : trial.recruitment.category === "not_open"
      ? "possibly_not_met"
      : trial.recruitment.category === "unknown"
        ? "missing"
        : "unknown";

  const assessments: CriterionAssessment[] = [
    { key: "condition", outcome: diseaseOverlap ? "possibly_met" : "possibly_not_met", patientFactIds: cancerFacts.map((fact) => fact.id), registryField: "conditions/title", explanationZhHant: diseaseOverlap ? "確認摘要與登錄疾病用語有交集。" : "確認摘要與公開登錄疾病用語未找到明確交集。", explanationEn: diseaseOverlap ? "The confirmed summary overlaps the registered condition terms." : "No clear overlap was found with the public condition terms." },
    { key: "recruitment", outcome: recruitmentOutcome, patientFactIds: [], registryField: "recruitment status", explanationZhHant: recruitmentOutcome === "possibly_met" ? "公開登錄狀態為招募中。" : recruitmentOutcome === "possibly_not_met" ? "公開登錄顯示目前未招募；此項與疾病條件是否相符分開呈現。" : recruitmentOutcome === "missing" ? "此來源未公開可靠的招募狀態，需向試驗團隊確認。" : "公開登錄狀態為尚未招募或僅限邀請，需向試驗團隊確認可否加入。", explanationEn: recruitmentOutcome === "possibly_met" ? "The public registry status is Recruiting." : recruitmentOutcome === "possibly_not_met" ? "The public registry is not recruiting; availability is shown separately from clinical fit." : recruitmentOutcome === "missing" ? "This source does not publish a reliable recruitment status; confirm with the study team." : "The public registry says not yet recruiting or invitation only; confirm availability with the study team." },
    { key: "age", outcome: !ageKnown ? "missing" : ageWithin ? "possibly_met" : "possibly_not_met", patientFactIds: age.factIds, registryField: "minimumAge/maximumAge", explanationZhHant: !ageKnown ? "病人摘要或登錄缺少可比較的年齡資料。" : ageWithin ? "確認年齡在公開年齡範圍內。" : "確認年齡不在公開年齡範圍內。", explanationEn: !ageKnown ? "The patient summary or registry is missing comparable age information." : ageWithin ? "The confirmed age is within the public age range." : "The confirmed age is outside the public age range." },
    { key: "sex", outcome: !registrySex || (!patientSex && !sexUnrestricted) ? "missing" : sexUnrestricted || sexWithin ? "possibly_met" : "possibly_not_met", patientFactIds: sexFacts.map((fact) => fact.id), registryField: "sex", explanationZhHant: !registrySex || (!patientSex && !sexUnrestricted) ? "病人摘要或登錄缺少可比較的性別條件。" : sexUnrestricted ? "公開登錄未限制性別。" : sexWithin ? "確認資料與公開性別條件一致。" : "確認資料與公開性別條件不一致。", explanationEn: !registrySex || (!patientSex && !sexUnrestricted) ? "The patient summary or registry is missing comparable sex information." : sexUnrestricted ? "The public registry does not restrict sex." : sexWithin ? "The confirmed information matches the public sex criterion." : "The confirmed information does not match the public sex criterion." },
    { key: "location", outcome: locationOutcome, patientFactIds: travelFacts.map((fact) => fact.id), registryField: "locations", explanationZhHant: locationOutcome === "missing" ? "缺少旅行偏好或登錄地點資料。" : locationOutcome === "possibly_met" ? `旅行偏好與 ${trial.regionTier} 地區層級一致；未估算實際旅行時間。` : locationOutcome === "possibly_not_met" ? `旅行偏好與 ${trial.regionTier} 地區層級不同。` : "已有地點與旅行資訊，但仍無法可靠判定可行性。", explanationEn: locationOutcome === "missing" ? "Travel preference or registry location information is missing." : locationOutcome === "possibly_met" ? `Travel preference aligns with the ${trial.regionTier} region tier; actual travel time is not estimated.` : locationOutcome === "possibly_not_met" ? `Travel preference differs from the ${trial.regionTier} region tier.` : "Location and travel information exist, but feasibility remains uncertain." },
    { key: "eligibility_details", outcome: eligibilityOutcome, patientFactIds: eligibilityFacts.map((fact) => fact.id), registryField: potentialExclusions.length > 0 ? "exclusion criteria" : "eligibility criteria", explanationZhHant: potentialExclusions.length > 0 ? "已確認的治療用語與公開排除條件有交集，可能是排除訊號；仍需人工確認。" : eligibilityOutcome === "missing" ? "病人摘要或公開登錄缺少其他可比較資格資料。" : "雙方都有其他資格資料，但需要逐條人工確認，不能僅靠用語交集判定。", explanationEn: potentialExclusions.length > 0 ? "A confirmed treatment term overlaps the public exclusion criteria and may be an exclusion signal; human review is still required." : eligibilityOutcome === "missing" ? "The patient summary or public registry is missing other comparable eligibility details." : "Both sides contain other eligibility details, but they require criterion-by-criterion review and cannot be decided by term overlap alone." },
  ];
  const clinicalAssessments = assessments.filter((item) => item.key !== "recruitment");
  const status = clinicalAssessments.some((item) => item.outcome === "possibly_not_met")
    ? "unlikely_based_on_public_record"
    : clinicalAssessments.some((item) => item.outcome === "missing")
      ? "needs_information"
      : clinicalAssessments.some((item) => item.outcome === "unknown") ? "needs_review" : "discuss";
  return { trial, status, assessments, potentialExclusions };
}

export async function matchConfirmedProfile(profileInput: ConfirmedProfile, adapters?: TrialRegistryAdapter[], signal?: AbortSignal) {
  const profile = confirmedProfileSchema.parse(profileInput);
  const condition = deriveConditionQuery(profile);
  const cancerFacts = factsFor(profile, ["cancer_type", "primary_site", "histology"]);
  const result = await searchTrialRegistries(
    { condition, pageSize: 50, includeNotOpen: true },
    adapters,
    {
      TFDA: cancerFacts.map((fact) => fact.displayZhHant).join(" ").slice(0, 120),
      "ClinicalTrials.gov": cancerFacts.map((fact) => fact.displayEn).join(" ").slice(0, 120),
    },
    { signal },
  );
  return { ...result, matches: result.trials.map((trial) => assessTrial(profile, trial)) };
}
