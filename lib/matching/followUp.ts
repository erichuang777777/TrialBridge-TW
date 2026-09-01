import { maskDirectIdentifiers } from "../privacy/mask.ts";
import { confirmedProfileSchema, type ConfirmedProfile } from "../profile/schema.ts";
import type { NormalizedTrial } from "../trials/types.ts";

export const FOLLOW_UP_UNKNOWN = "__unknown__";

type FollowUpDomain = "age_band" | "sex_eligibility" | "travel_preference" | "stage" | "biomarker" | "prior_therapy" | "performance_status" | "organ_function" | "treatment_date";

export interface FollowUpQuestion {
  id: string;
  domain: FollowUpDomain;
  questionEn: string;
  questionZhHant: string;
  reasonEn: string;
  reasonZhHant: string;
  registryField: string;
  trialCount?: number;
}

export function derivePreMatchQuestions(profile: ConfirmedProfile, trials: NormalizedTrial[], limit = 6): FollowUpQuestion[] {
  const aggregated = new Map<FollowUpDomain, FollowUpQuestion>();
  for (const trial of trials) {
    for (const question of deriveFollowUpQuestions(profile, trial)) {
      const existing = aggregated.get(question.domain);
      if (existing) existing.trialCount = (existing.trialCount ?? 1) + 1;
      else aggregated.set(question.domain, { ...question, trialCount: 1 });
    }
  }
  return [...aggregated.values()].sort((a, b) => (b.trialCount ?? 0) - (a.trialCount ?? 0)).slice(0, limit);
}

function hasDomain(profile: ConfirmedProfile, domains: FollowUpDomain[]) {
  return profile.facts.some((fact) => domains.includes(fact.domain as FollowUpDomain));
}

export function deriveFollowUpQuestions(profileInput: ConfirmedProfile, trial: NormalizedTrial): FollowUpQuestion[] {
  const profile = confirmedProfileSchema.parse(profileInput);
  const criteria = [trial.eligibility.combined, trial.eligibility.inclusion, trial.eligibility.exclusion].filter(Boolean).join(" ");
  const questions: FollowUpQuestion[] = [];
  const add = (question: FollowUpQuestion) => questions.push(question);

  if ((trial.eligibility.minimumAge || trial.eligibility.maximumAge) && !hasDomain(profile, ["age_band"])) add({
    id: "question_followup_age", domain: "age_band", registryField: "minimumAge/maximumAge",
    questionEn: "What is the patient's current age in years?", questionZhHant: "病人目前幾歲？",
    reasonEn: "The registry lists an age range.", reasonZhHant: "登錄資料列有年齡範圍。",
  });
  if (trial.eligibility.sex && trial.eligibility.sex.toUpperCase() !== "ALL" && !hasDomain(profile, ["sex_eligibility"])) add({
    id: "question_followup_sex", domain: "sex_eligibility", registryField: "sex",
    questionEn: "What sex eligibility information is recorded for the patient?", questionZhHant: "病歷記載的性別條件為何？",
    reasonEn: "The registry restricts enrollment by sex.", reasonZhHant: "登錄資料有性別限制。",
  });
  if (trial.locations.length > 0 && !hasDomain(profile, ["travel_preference"])) add({
    id: "question_followup_travel", domain: "travel_preference", registryField: "locations",
    questionEn: "Could the patient travel within Taiwan, elsewhere in Asia, or worldwide for a trial?", questionZhHant: "病人可為試驗前往台灣、亞洲其他地區，或全球地點嗎？",
    reasonEn: "The registry lists study locations, but travel preference is missing.", reasonZhHant: "登錄資料有試驗地點，但摘要缺少旅行偏好。",
  });
  if (/\b(stage|metastatic|advanced|locally advanced)\b|分期|第[一二三四1-4]期|轉移|晚期/iu.test(criteria) && !hasDomain(profile, ["stage"])) add({
    id: "question_followup_stage", domain: "stage", registryField: "eligibility criteria",
    questionEn: "What cancer stage or extent of disease has the care team documented?", questionZhHant: "醫療團隊記載的癌症分期或疾病範圍為何？",
    reasonEn: "The public criteria mention disease stage or extent.", reasonZhHant: "公開條件提到疾病分期或範圍。",
  });
  if (/\b(HER2|EGFR|ALK|KRAS|BRAF|PD-L1|PDL1|MSI|MMR|BRCA|NTRK|ROS1|RET|MET|FGFR|biomarker|mutation|expression)\b|生物標記|基因|突變|受體|表現/iu.test(criteria) && !hasDomain(profile, ["biomarker"])) add({
    id: "question_followup_biomarker", domain: "biomarker", registryField: "eligibility criteria",
    questionEn: "Are any biomarker or molecular test results available?", questionZhHant: "是否有任何生物標記或分子檢測結果？",
    reasonEn: "The public criteria mention a biomarker or molecular result.", reasonZhHant: "公開條件提到生物標記或分子檢測。",
  });
  if (/\b(prior|previous|pretreated|chemotherapy|radiotherapy|immunotherapy|line of therapy|treatment-naive)\b|既往|曾接受|治療線|化療|放療|免疫治療/iu.test(criteria) && !hasDomain(profile, ["prior_therapy"])) add({
    id: "question_followup_prior", domain: "prior_therapy", registryField: "eligibility criteria",
    questionEn: "Which cancer treatments has the patient previously received?", questionZhHant: "病人過去接受過哪些癌症治療？",
    reasonEn: "The public criteria mention prior treatment.", reasonZhHant: "公開條件提到既往治療。",
  });
  if (/\b(ECOG|Karnofsky|performance status)\b|體能狀態|日常活動能力/iu.test(criteria) && !hasDomain(profile, ["performance_status"])) add({
    id: "question_followup_performance", domain: "performance_status", registryField: "eligibility criteria",
    questionEn: "Is an ECOG, Karnofsky, or other performance-status score documented?", questionZhHant: "病歷是否記載 ECOG、Karnofsky 或其他體能狀態分數？",
    reasonEn: "The public criteria mention performance status.", reasonZhHant: "公開條件提到體能狀態。",
  });
  if (/\b(renal|kidney|hepatic|liver|cardiac|organ function|creatinine|bilirubin|platelet|neutrophil|AST|ALT)\b|腎功能|肝功能|心臟功能|器官功能|血球|血小板/iu.test(criteria) && !hasDomain(profile, ["organ_function"])) add({
    id: "question_followup_organ", domain: "organ_function", registryField: "eligibility criteria",
    questionEn: "Are recent blood counts, kidney, liver, or heart-function results available?", questionZhHant: "是否有近期血球、腎臟、肝臟或心臟功能結果？",
    reasonEn: "The public criteria mention laboratory or organ-function requirements.", reasonZhHant: "公開條件提到檢驗或器官功能要求。",
  });
  if (/\b(washout|last dose|within \d+ (days|weeks|months))\b|停藥期|最後一次治療|近\s*\d+\s*(天|週|月)/iu.test(criteria) && !hasDomain(profile, ["treatment_date"])) add({
    id: "question_followup_date", domain: "treatment_date", registryField: "eligibility criteria",
    questionEn: "When was the patient's most recent cancer treatment?", questionZhHant: "病人最近一次癌症治療是何時？",
    reasonEn: "The public criteria mention treatment timing or a washout period.", reasonZhHant: "公開條件提到治療時間或停藥期。",
  });

  return questions.slice(0, 6);
}

export function appendConfirmedFollowUpAnswers(
  profileInput: ConfirmedProfile,
  questions: FollowUpQuestion[],
  answers: Record<string, string>,
  confirmedAt = new Date().toISOString(),
): ConfirmedProfile {
  const profile = confirmedProfileSchema.parse(profileInput);
  const existingDomains = new Set(profile.facts.map((fact) => fact.domain));
  const additions = questions.flatMap((question) => {
    const raw = answers[question.id]?.trim();
    if (!raw || raw === FOLLOW_UP_UNKNOWN || existingDomains.has(question.domain)) return [];
    const value = maskDirectIdentifiers(raw).maskedText.trim().slice(0, 500);
    if (!value) return [];
    existingDomains.add(question.domain);
    return [{
      id: `fact_followup_${question.domain}`,
      domain: question.domain,
      value,
      displayZhHant: value,
      displayEn: value,
      source: profile.subjectRole === "caregiver" ? "caregiver_statement" as const : "user_statement" as const,
      confidence: 1,
      confirmed: true as const,
      confirmedAt,
      confirmationSource: profile.subjectRole,
    }];
  });
  return confirmedProfileSchema.parse({ ...profile, facts: [...profile.facts, ...additions], confirmedAt });
}
