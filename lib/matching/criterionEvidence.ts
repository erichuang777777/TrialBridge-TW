import type { ConfirmedProfile } from "../profile/schema.ts";
import type { NormalizedTrial } from "../trials/types.ts";

export type DetailedCriterionKey = "subtype" | "stage" | "biomarker" | "prior_treatment";
export type DetailedCriterionState = "shared_term" | "possible_difference" | "uncertain" | "missing";

export interface DetailedCriterionEvidence {
  key: DetailedCriterionKey;
  state: DetailedCriterionState;
  patientFactIds: string[];
  patientValueEn?: string;
  patientValueZhHant?: string;
  registryField: "inclusion criteria" | "exclusion criteria" | "eligibility criteria";
  registryExcerpt?: string;
  explanationEn: string;
  explanationZhHant: string;
  affectsOverallStatus: false;
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

type CriterionPart = { role: "inclusion" | "exclusion" | "combined"; field: DetailedCriterionEvidence["registryField"]; text: string };
type MarkerEvidence = { marker: string; state?: string };

const interventionStopTerms = new Set(["cancer", "patient", "patients", "prior", "previous", "received", "treatment", "therapy", "chemotherapy", "radiotherapy", "immunotherapy", "current", "with", "without", "and", "the"]);
const stagePattern = /\b(?:stage\s*(?:i{1,3}|iv|[1-4])|metastatic|locally advanced|advanced)\b|第\s*[一二三四1-4]\s*期|轉移|局部晚期|晚期/giu;
const subtypePatterns = [
  ["adenocarcinoma", /\badenocarcinoma\b|腺癌/giu],
  ["squamous_cell", /\bsquamous(?: cell)?\b|鱗狀細胞/giu],
  ["small_cell", /(?<!non[- ])\bsmall[- ]cell\b|(?<!非)小細胞/giu],
  ["non_small_cell", /\bnon[- ]small[- ]cell\b|非小細胞/giu],
  ["ductal", /\bductal\b|導管/giu],
  ["lobular", /\blobular\b|小葉/giu],
  ["serous", /\bserous\b|漿液性/giu],
  ["mucinous", /\bmucinous\b|黏液性/giu],
  ["clear_cell", /\bclear[- ]cell\b|透明細胞/giu],
  ["endometrioid", /\bendometrioid\b|類子宮內膜/giu],
  ["glioblastoma", /\bglioblastoma\b|膠質母細胞瘤/giu],
  ["melanoma", /\bmelanoma\b|黑色素瘤/giu],
] as const;
const markerPatterns = [
  ["PD-L1", /\bPD[- ]?L1\b/giu], ["HER2", /\bHER[- ]?2\b/giu], ["EGFR", /\bEGFR\b/giu],
  ["ALK", /\bALK\b/giu], ["KRAS", /\bKRAS\b/giu], ["BRAF", /\bBRAF\b/giu],
  ["MSI", /\bMSI(?:[- ]?[HL])?\b|microsatellite instability/giu], ["MMR", /\b[dp]?MMR\b|mismatch repair/giu],
  ["BRCA", /\bBRCA[12]?\b/giu], ["NTRK", /\bNTRK\b/giu], ["ROS1", /\bROS1\b/giu],
  ["RET", /\bRET\b/giu], ["MET", /\bMET\b/giu], ["FGFR", /\bFGFR[1-4]?\b/giu],
] as const;
const biomarkerPattern = /\b(?:PD[- ]?L1|HER[- ]?2|EGFR|ALK|KRAS|BRAF|MSI(?:[- ]?[HL])?|MMR|BRCA[12]?|NTRK|ROS1|RET|MET|FGFR[1-4]?)\b/giu;
const priorTreatmentPattern = /\b(?:prior|previous|pretreated|chemotherapy|radiotherapy|immunotherapy|line of therapy|treatment[- ]naive)\b|既往|曾接受|治療線|化療|放療|免疫治療/giu;

function factsFor(profile: ConfirmedProfile, domains: string[]) {
  return profile.facts.filter((fact) => domains.includes(fact.domain));
}

function patientDisplay(profile: ConfirmedProfile, domains: string[]) {
  const facts = factsFor(profile, domains);
  const join = (language: "en" | "zh-Hant") => facts.map((fact) => language === "en" ? fact.displayEn : fact.displayZhHant).join(" · ").slice(0, 220) || undefined;
  return { facts, en: join("en"), zh: join("zh-Hant") };
}

function criterionParts(trial: NormalizedTrial): CriterionPart[] {
  const parts: CriterionPart[] = [];
  if (trial.eligibility.inclusion) parts.push({ role: "inclusion", field: "inclusion criteria", text: trial.eligibility.inclusion });
  if (trial.eligibility.exclusion) parts.push({ role: "exclusion", field: "exclusion criteria", text: trial.eligibility.exclusion });
  if (parts.length === 0 && trial.eligibility.combined) parts.push({ role: "combined", field: "eligibility criteria", text: trial.eligibility.combined });
  return parts;
}

function normalizedTerms(value: string): string[] {
  return value.toLocaleLowerCase("en").split(/[^\p{L}\p{N}+]+/u).filter((term) => term.length >= 2);
}

function matchedInterventionTerms(patientValue: string, registryText: string): string[] {
  const registryTerms = new Set(normalizedTerms(registryText));
  return [...new Set(normalizedTerms(patientValue).flatMap((term) => {
    if (term.length < 4 || interventionStopTerms.has(term)) return [];
    const match = [...registryTerms].find((candidate) => candidate === term || (Math.min(candidate.length, term.length) >= 5 && (candidate.includes(term) || term.includes(candidate))));
    return match ? [term] : [];
  }))];
}

function excerptAround(value: string, pattern: RegExp, fallbackTerm?: string): string {
  pattern.lastIndex = 0;
  const match = pattern.exec(value);
  const fallbackIndex = fallbackTerm ? value.toLocaleLowerCase("en").indexOf(fallbackTerm.toLocaleLowerCase("en")) : -1;
  const index = match?.index ?? Math.max(0, fallbackIndex);
  return value.slice(Math.max(0, index - 70), Math.min(value.length, index + 170)).trim();
}

function stageConcepts(value: string): Set<string> {
  const concepts = new Set<string>();
  const normalized = value.toLocaleLowerCase("en");
  const stageMap = [["4", /\bstage\s*(?:iv|4)\b|第\s*[四4]\s*期/u], ["3", /\bstage\s*(?:iii|3)\b|第\s*[三3]\s*期/u], ["2", /\bstage\s*(?:ii|2)\b|第\s*[二2]\s*期/u], ["1", /\bstage\s*(?:i|1)\b|第\s*[一1]\s*期/u]] as const;
  for (const [stage, pattern] of stageMap) if (pattern.test(normalized)) concepts.add(`stage_${stage}`);
  if (/\bmetastatic\b|轉移/u.test(normalized)) concepts.add("metastatic");
  if (/\blocally advanced\b|局部晚期/u.test(normalized)) concepts.add("locally_advanced");
  if (/\badvanced\b|晚期/u.test(normalized.replace(/\blocally advanced\b|局部晚期/gu, ""))) concepts.add("advanced");
  return concepts;
}

function subtypeConcepts(value: string): Set<string> {
  const concepts = new Set<string>();
  for (const [name, pattern] of subtypePatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) concepts.add(name);
  }
  return concepts;
}

function markerState(windowText: string): string | undefined {
  const value = windowText.toLocaleLowerCase("en");
  if (/msi[- ]?h|instability[- ]high|\bhigh\b/.test(value)) return "high";
  if (/\bmss\b|microsatellite stable|\bstable\b/.test(value)) return "stable";
  if (/\bdmmr\b|deficient/.test(value)) return "deficient";
  if (/\bpmmr\b|proficient/.test(value)) return "proficient";
  if (/wild[- ]?type|野生型/.test(value)) return "wild_type";
  if (/mutat(?:ed|ion)|突變/.test(value)) return "mutated";
  if (/amplif(?:ied|ication)|擴增/.test(value)) return "amplified";
  if (/negative|陰性/.test(value)) return "negative";
  if (/positive|陽性/.test(value)) return "positive";
  return undefined;
}

function markerEvidence(value: string): MarkerEvidence[] {
  const evidence: MarkerEvidence[] = [];
  for (const [marker, pattern] of markerPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(value);
    if (!match) continue;
    const context = value.slice(Math.max(0, match.index - 35), Math.min(value.length, match.index + match[0].length + 45));
    evidence.push({ marker, state: markerState(context) });
  }
  return evidence;
}

function intersects(left: Set<string>, right: Set<string>) {
  return [...left].some((value) => right.has(value));
}

function baseEvidence(key: DetailedCriterionKey, profile: ConfirmedProfile, domains: string[], part?: CriterionPart): Omit<DetailedCriterionEvidence, "state" | "explanationEn" | "explanationZhHant"> {
  const patient = patientDisplay(profile, domains);
  return {
    key,
    patientFactIds: patient.facts.map((fact) => fact.id),
    ...(patient.en ? { patientValueEn: patient.en } : {}),
    ...(patient.zh ? { patientValueZhHant: patient.zh } : {}),
    registryField: part?.field ?? "eligibility criteria",
    affectsOverallStatus: false,
  };
}

function deriveStage(profile: ConfirmedProfile, trial: NormalizedTrial): DetailedCriterionEvidence {
  const patient = patientDisplay(profile, ["stage", "disease_extent"]);
  const parts = criterionParts(trial);
  const patientConcepts = stageConcepts(patient.facts.map((fact) => `${fact.value} ${fact.displayEn} ${fact.displayZhHant}`).join(" "));
  const relevant = parts.map((part) => ({ part, concepts: stageConcepts(part.text) })).filter((item) => item.concepts.size > 0);
  const exclusion = relevant.find((item) => item.part.role === "exclusion" && intersects(patientConcepts, item.concepts));
  const inclusion = relevant.find((item) => item.part.role === "inclusion" && intersects(patientConcepts, item.concepts));
  const numericPatient = [...patientConcepts].filter((value) => value.startsWith("stage_"));
  const numericInclusion = relevant.flatMap((item) => item.part.role === "inclusion" ? [...item.concepts].filter((value) => value.startsWith("stage_")) : []);
  const selected = exclusion?.part ?? inclusion?.part ?? relevant[0]?.part;
  const base = baseEvidence("stage", profile, ["stage", "disease_extent"], selected);
  const registryExcerpt = selected ? excerptAround(selected.text, stagePattern) : undefined;
  if (patient.facts.length === 0 && relevant.length === 0) return { ...base, state: "missing", explanationEn: "Neither the confirmed summary nor public criteria contain comparable stage or disease-extent wording.", explanationZhHant: "確認摘要與公開條件都沒有可比較的分期或疾病範圍用語。" };
  if (patient.facts.length === 0) return { ...base, state: "missing", ...(registryExcerpt ? { registryExcerpt } : {}), explanationEn: "The public criteria mention stage or disease extent, but the confirmed summary does not contain it.", explanationZhHant: "公開條件提到分期或疾病範圍，但確認摘要尚未提供。" };
  if (relevant.length === 0) return { ...base, state: "missing", explanationEn: "The confirmed summary contains stage information, but no comparable public stage wording was found.", explanationZhHant: "確認摘要已有分期，但公開條件未找到可比較的分期用語。" };
  if (exclusion) return { ...base, registryExcerpt, state: "possible_difference", explanationEn: "The same normalized stage term appears in the public exclusion wording. This is a review signal, not a final exclusion.", explanationZhHant: "相同的標準化分期用語出現在公開排除條件；這是複核訊號，不是最終排除判定。" };
  if (inclusion) return { ...base, registryExcerpt, state: "shared_term", explanationEn: "The confirmed summary and public inclusion wording share a normalized stage term. Context still requires human review.", explanationZhHant: "確認摘要與公開納入條件有相同的標準化分期用語；仍需人工確認上下文。" };
  if (numericPatient.length > 0 && numericInclusion.length > 0) return { ...base, ...(registryExcerpt ? { registryExcerpt } : {}), state: "possible_difference", explanationEn: "The confirmed and public criteria contain different explicit stage numbers. Confirm the exact staging system and context.", explanationZhHant: "確認資料與公開條件出現不同的明確期別；需確認分期系統與上下文。" };
  return { ...base, ...(registryExcerpt ? { registryExcerpt } : {}), state: "uncertain", explanationEn: "Both sides mention stage or disease extent, but the wording cannot be safely aligned.", explanationZhHant: "雙方都提到分期或疾病範圍，但目前無法安全對齊用語。" };
}

function deriveSubtype(profile: ConfirmedProfile, trial: NormalizedTrial): DetailedCriterionEvidence {
  const patient = patientDisplay(profile, ["histology"]);
  const parts = criterionParts(trial);
  const patientConcepts = subtypeConcepts(patient.facts.map((fact) => `${fact.value} ${fact.displayEn} ${fact.displayZhHant}`).join(" "));
  const relevant = parts.map((part) => ({ part, concepts: subtypeConcepts(part.text) })).filter((item) => item.concepts.size > 0);
  const exclusion = relevant.find((item) => item.part.role === "exclusion" && intersects(patientConcepts, item.concepts));
  const inclusion = relevant.find((item) => item.part.role === "inclusion" && intersects(patientConcepts, item.concepts));
  const selected = exclusion?.part ?? inclusion?.part ?? relevant[0]?.part;
  const base = baseEvidence("subtype", profile, ["histology"], selected);
  const registryExcerpt = selected ? excerptAround(selected.text, new RegExp(subtypePatterns.map(([, pattern]) => pattern.source).join("|"), "iu")) : undefined;
  if (patient.facts.length === 0 && relevant.length === 0) return { ...base, state: "missing", explanationEn: "Neither the confirmed summary nor public criteria contain comparable histologic-subtype wording.", explanationZhHant: "確認摘要與公開條件都沒有可比較的組織亞型用語。" };
  if (patient.facts.length === 0) return { ...base, state: "missing", ...(registryExcerpt ? { registryExcerpt } : {}), explanationEn: "The public criteria mention a histologic subtype, but the confirmed summary does not contain one.", explanationZhHant: "公開條件提到組織亞型，但確認摘要尚未提供。" };
  if (relevant.length === 0) return { ...base, state: "missing", explanationEn: "The confirmed summary contains a subtype, but no comparable public subtype wording was found.", explanationZhHant: "確認摘要已有亞型，但公開條件未找到可比較的亞型用語。" };
  if (exclusion) return { ...base, registryExcerpt, state: "possible_difference", explanationEn: "The same normalized subtype appears in public exclusion wording. Confirm the full criterion with the study team.", explanationZhHant: "相同的標準化亞型出現在公開排除條件；需向試驗團隊確認完整條件。" };
  if (inclusion) return { ...base, registryExcerpt, state: "shared_term", explanationEn: "The confirmed summary and public inclusion wording share a normalized subtype term.", explanationZhHant: "確認摘要與公開納入條件有相同的標準化亞型用語。" };
  if (patientConcepts.size > 0 && relevant.some((item) => item.part.role === "inclusion")) return { ...base, ...(registryExcerpt ? { registryExcerpt } : {}), state: "possible_difference", explanationEn: "The confirmed subtype and explicit public subtype wording differ. This remains a human-review signal.", explanationZhHant: "確認亞型與公開條件的明確亞型用語不同；仍屬人工複核訊號。" };
  return { ...base, ...(registryExcerpt ? { registryExcerpt } : {}), state: "uncertain", explanationEn: "Subtype information exists on both sides, but it cannot be normalized reliably.", explanationZhHant: "雙方都有亞型資訊，但目前無法可靠標準化。" };
}

function deriveBiomarker(profile: ConfirmedProfile, trial: NormalizedTrial): DetailedCriterionEvidence {
  const patient = patientDisplay(profile, ["biomarker"]);
  const parts = criterionParts(trial);
  const patientMarkers = markerEvidence(patient.facts.map((fact) => `${fact.value} ${fact.displayEn} ${fact.displayZhHant}`).join(" "));
  const relevant = parts.map((part) => ({ part, markers: markerEvidence(part.text) })).filter((item) => item.markers.length > 0);
  const comparisons = relevant.flatMap((item) => item.markers.flatMap((registryMarker) => patientMarkers.filter((patientMarker) => patientMarker.marker === registryMarker.marker).map((patientMarker) => ({ ...item, patientMarker, registryMarker }))));
  const conflictPairs = new Set(["positive:negative", "negative:positive", "mutated:wild_type", "wild_type:mutated", "high:stable", "stable:high", "deficient:proficient", "proficient:deficient"]);
  const exclusion = comparisons.find((item) => item.part.role === "exclusion" && item.patientMarker.state && item.patientMarker.state === item.registryMarker.state);
  const conflict = comparisons.find((item) => item.part.role === "inclusion" && item.patientMarker.state && item.registryMarker.state && conflictPairs.has(`${item.patientMarker.state}:${item.registryMarker.state}`));
  const shared = comparisons.find((item) => item.part.role === "inclusion" && item.patientMarker.state && item.patientMarker.state === item.registryMarker.state);
  const selected = exclusion?.part ?? conflict?.part ?? shared?.part ?? comparisons[0]?.part ?? relevant[0]?.part;
  const base = baseEvidence("biomarker", profile, ["biomarker"], selected);
  const registryExcerpt = selected ? excerptAround(selected.text, biomarkerPattern) : undefined;
  if (patient.facts.length === 0 && relevant.length === 0) return { ...base, state: "missing", explanationEn: "Neither the confirmed summary nor public criteria contain comparable biomarker wording.", explanationZhHant: "確認摘要與公開條件都沒有可比較的生物標記用語。" };
  if (patient.facts.length === 0) return { ...base, state: "missing", ...(registryExcerpt ? { registryExcerpt } : {}), explanationEn: "The public criteria mention a biomarker, but the confirmed summary does not contain a result.", explanationZhHant: "公開條件提到生物標記，但確認摘要尚未提供檢測結果。" };
  if (relevant.length === 0) return { ...base, state: "missing", explanationEn: "The confirmed summary contains a biomarker result, but no comparable public biomarker wording was found.", explanationZhHant: "確認摘要已有生物標記結果，但公開條件未找到可比較用語。" };
  if (exclusion) return { ...base, registryExcerpt, state: "possible_difference", explanationEn: "The same normalized marker and status appear in public exclusion wording. Confirm assay, threshold, and context.", explanationZhHant: "相同的標記與狀態出現在公開排除條件；需確認檢測方法、門檻與上下文。" };
  if (conflict) return { ...base, registryExcerpt, state: "possible_difference", explanationEn: "The public inclusion wording and confirmed marker have opposing normalized states. Confirm assay and threshold.", explanationZhHant: "公開納入條件與確認標記呈現相反的標準化狀態；需確認檢測方法與門檻。" };
  if (shared) return { ...base, registryExcerpt, state: "shared_term", explanationEn: "The confirmed and public inclusion wording share the same normalized marker and state. Thresholds still require review.", explanationZhHant: "確認資料與公開納入條件有相同的標記與狀態；門檻仍需複核。" };
  return { ...base, ...(registryExcerpt ? { registryExcerpt } : {}), state: "uncertain", explanationEn: "A biomarker term overlaps or both sides contain marker data, but polarity or threshold cannot be safely aligned.", explanationZhHant: "生物標記用語有交集或雙方都有資料，但極性或門檻無法安全對齊。" };
}

export function derivePotentialInterventionExclusions(profile: ConfirmedProfile, trial: NormalizedTrial): PotentialExclusionSignal[] {
  const exclusion = trial.eligibility.exclusion;
  if (!exclusion) return [];
  return factsFor(profile, ["prior_therapy", "current_therapy"]).flatMap((fact) => {
    const matchedTerms = matchedInterventionTerms(fact.value, exclusion);
    if (matchedTerms.length === 0) return [];
    return [{
      patientFactId: fact.id,
      confirmedIntervention: fact.value,
      matchedTerms,
      registryField: "exclusion criteria" as const,
      registryExcerpt: excerptAround(exclusion, priorTreatmentPattern, matchedTerms[0]),
      explanationEn: "A confirmed treatment term also appears in the public exclusion criteria. The study team must confirm the treatment name, timing, and context.",
      explanationZhHant: "已確認的治療用語也出現在公開排除條件中；仍需由試驗團隊確認治療名稱、時間與上下文。",
    }];
  });
}

function derivePriorTreatment(profile: ConfirmedProfile, trial: NormalizedTrial, exclusions: PotentialExclusionSignal[]): DetailedCriterionEvidence {
  const patient = patientDisplay(profile, ["prior_therapy", "current_therapy"]);
  const parts = criterionParts(trial);
  const relevant = parts.filter((part) => {
    priorTreatmentPattern.lastIndex = 0;
    return priorTreatmentPattern.test(part.text) || patient.facts.some((fact) => matchedInterventionTerms(fact.value, part.text).length > 0);
  });
  const shared = relevant.find((part) => part.role === "inclusion" && patient.facts.some((fact) => matchedInterventionTerms(fact.value, part.text).length > 0));
  const selected = exclusions.length > 0 ? parts.find((part) => part.role === "exclusion") : shared ?? relevant[0];
  const base = baseEvidence("prior_treatment", profile, ["prior_therapy", "current_therapy"], selected);
  const registryExcerpt = exclusions[0]?.registryExcerpt ?? (selected ? excerptAround(selected.text, priorTreatmentPattern) : undefined);
  if (patient.facts.length === 0 && relevant.length === 0) return { ...base, state: "missing", explanationEn: "Neither the confirmed summary nor public criteria contain comparable treatment-history wording.", explanationZhHant: "確認摘要與公開條件都沒有可比較的治療史用語。" };
  if (patient.facts.length === 0) return { ...base, state: "missing", ...(registryExcerpt ? { registryExcerpt } : {}), explanationEn: "The public criteria mention treatment history, but the confirmed summary does not contain it.", explanationZhHant: "公開條件提到治療史，但確認摘要尚未提供。" };
  if (relevant.length === 0 && exclusions.length === 0) return { ...base, state: "missing", explanationEn: "The confirmed summary contains treatment history, but no comparable public treatment wording was found.", explanationZhHant: "確認摘要已有治療史，但公開條件未找到可比較用語。" };
  if (exclusions.length > 0) return { ...base, registryField: "exclusion criteria", registryExcerpt, state: "possible_difference", explanationEn: exclusions[0].explanationEn, explanationZhHant: exclusions[0].explanationZhHant };
  if (shared) return { ...base, registryExcerpt, state: "shared_term", explanationEn: "A confirmed treatment term also appears in public inclusion wording. Timing, line, and response still require review.", explanationZhHant: "已確認的治療用語也出現在公開納入條件；治療時間、線別與反應仍需複核。" };
  return { ...base, ...(registryExcerpt ? { registryExcerpt } : {}), state: "uncertain", explanationEn: "Both sides contain treatment-history information, but no safe criterion-level alignment was found.", explanationZhHant: "雙方都有治療史資訊，但尚未找到可安全判讀的逐條對齊。" };
}

export function deriveDetailedCriterionEvidence(profile: ConfirmedProfile, trial: NormalizedTrial, exclusions = derivePotentialInterventionExclusions(profile, trial)): DetailedCriterionEvidence[] {
  return [deriveSubtype(profile, trial), deriveStage(profile, trial), deriveBiomarker(profile, trial), derivePriorTreatment(profile, trial, exclusions)];
}
