import { confirmedProfileSchema, type ConfirmedProfile } from "../profile/schema.ts";
import type { AssessmentOutcome, TrialMatch } from "./engine.ts";

export interface TrialDiscussionBrief {
  title: string;
  markdown: string;
  trialCount: number;
  createdAt: string;
  containsConfirmedHealthInformation: true;
  sent: false;
}

const statusCopy = {
  en: {
    discuss: "No known public-record difference",
    needs_review: "Criterion-by-criterion review needed",
    needs_information: "More information needed",
    unlikely_based_on_public_record: "Public-record difference found",
  },
  "zh-Hant": {
    discuss: "目前無已知公開條件差異",
    needs_review: "需要逐條人工確認",
    needs_information: "仍需更多資訊",
    unlikely_based_on_public_record: "發現公開條件差異",
  },
} as const;

const outcomeCopy: Record<"en" | "zh-Hant", Record<AssessmentOutcome, string>> = {
  en: { possibly_met: "appears aligned", possibly_not_met: "appears different", unknown: "uncertain", missing: "missing" },
  "zh-Hant": { possibly_met: "看起來一致", possibly_not_met: "看起來不同", unknown: "不確定", missing: "缺少資料" },
};

function markdownCell(value: string) {
  return value.replaceAll("|", "\\|").replace(/[\r\n]+/g, " ").trim();
}

function compact(value: string | undefined, fallback: string) {
  return markdownCell(value?.trim() || fallback);
}

export function createTrialDiscussionBrief(
  profileInput: ConfirmedProfile,
  matchesInput: TrialMatch[],
  language: "zh-Hant" | "en",
  createdAt = new Date().toISOString(),
): TrialDiscussionBrief {
  const profile = confirmedProfileSchema.parse(profileInput);
  const matches = matchesInput.slice(0, 5);
  if (matches.length === 0) throw new Error("At least one current trial comparison is required.");

  const en = language === "en";
  const title = en ? "TrialBridge TW care-team discussion brief" : "TrialBridge TW 照護團隊討論摘要";
  const facts = profile.facts.map((fact) => `- **${markdownCell(fact.domain.replaceAll("_", " "))}:** ${markdownCell(en ? fact.displayEn : fact.displayZhHant)}`).join("\n");
  const comparisonRows = matches.map((match, index) => {
    const source = match.trial.sources[0];
    return `| TB-${String(index + 1).padStart(2, "0")} | ${markdownCell(source.registryId)} | ${markdownCell(match.trial.title)} | ${markdownCell(statusCopy[language][match.status])} | ${markdownCell(match.trial.regionTier)} |`;
  }).join("\n");
  const trialSections = matches.map((match, index) => {
    const trial = match.trial;
    const assessments = match.assessments.map((assessment) => `- **${markdownCell(assessment.key.replaceAll("_", " "))} — ${outcomeCopy[language][assessment.outcome]}:** ${markdownCell(en ? assessment.explanationEn : assessment.explanationZhHant)} _(registry field: ${markdownCell(assessment.registryField)})_`).join("\n");
    const exclusions = match.potentialExclusions.length > 0
      ? match.potentialExclusions.map((signal) => `- ${markdownCell(en ? signal.explanationEn : signal.explanationZhHant)} Confirmed intervention: ${markdownCell(signal.confirmedIntervention)}. Public excerpt: “${markdownCell(signal.registryExcerpt)}”`).join("\n")
      : (en ? "- No treatment-term overlap with the available public exclusion text was detected. This does not prove eligibility." : "- 在目前可取得的公開排除文字中，未偵測到治療用語交集；這不代表符合資格。");
    const sourceLines = trial.sources.map((source) => `- ${source.registry} — ${markdownCell(source.registryId)} — ${source.url} — ${en ? "retrieved" : "擷取"} ${markdownCell(source.retrievedAt)}`).join("\n");
    const locations = trial.locations.slice(0, 5).map((location) => [location.facility, location.city, location.country].filter(Boolean).join(", ")).join("; ");
    return `### TB-${String(index + 1).padStart(2, "0")} — ${markdownCell(trial.title)}

- **${en ? "Registry status" : "登錄狀態"}:** ${compact(trial.recruitment.raw, en ? "not reported" : "未登錄")}
- **${en ? "Phase / study type" : "期別／研究類型"}:** ${compact([...trial.phases, trial.studyType].filter(Boolean).join("; "), en ? "not reported" : "未登錄")}
- **${en ? "Interventions" : "介入措施"}:** ${compact(trial.interventions.join("; "), en ? "not reported" : "未登錄")}
- **${en ? "Locations" : "地點"}:** ${compact(locations, en ? "not reported" : "未登錄")}

#### ${en ? "Public-record comparison" : "公開資料比較"}

${assessments}

#### ${en ? "Potential exclusion signals" : "可能排除訊號"}

${exclusions}

#### ${en ? "Source traceability" : "來源追溯"}

${sourceLines}`;
  }).join("\n\n");

  const markdown = en ? `# ${title}

Generated: ${createdAt}

> **Privacy note:** This local draft contains confirmed health information. Store and share it securely. TrialBridge TW did not send or upload this file.

## Care-team brief

### Purpose and evidence status

This brief organizes current public clinical-trial registry records for discussion. The records describe research plans. Evidence quality, treatment benefit, harms, and guideline alignment were **not assessed** because registry listings alone cannot establish them. This is not an eligibility decision or treatment recommendation.

### Confirmed, de-identified context

${facts}

### Trial comparison inventory

| Ref | Registry ID | Public title | Comparison category | Region |
|---|---|---|---|---|
${comparisonRows}

${trialSections}

## Person-facing discussion handout

### What this list means

These studies appeared in a public-registry search using your confirmed summary. A green or aligned item only means that selected public wording looks similar. It does not show that you are eligible or that a study treatment will help.

### What is still uncertain

- Full eligibility often requires records, scans, laboratory results, timing details, and study-team review.
- Public registries may be incomplete or outdated.
- Treatment benefit, side effects, quality of life, and alternatives were not assessed in this brief.
- A potential exclusion signal is a term overlap for human review, not a final decision.

### Questions for your care or study team

- Does this study apply to my exact cancer subtype, stage, biomarkers, and treatment history?
- Which eligibility items cannot be checked from the public record?
- Could the timing of my previous or current treatments exclude me?
- What are the study intervention, visits, travel needs, possible risks, and alternatives?
- What records should I prepare before contacting the study site?

## What this brief does not prove

It does not prove eligibility, benefit, safety, superiority, guideline alignment, or that joining a study is the right choice. Only the study team can determine eligibility, together with discussion with your care team.
` : `# ${title}

產生時間：${createdAt}

> **隱私提醒：** 此本機草稿包含已確認的健康資訊，請安全保存與分享。TrialBridge TW 未寄送或上傳此檔案。

## 照護團隊摘要

### 用途與證據狀態

本摘要只整理目前公開的臨床試驗登錄資料供討論。登錄資料描述的是研究計畫；因為單靠登錄資料無法證明療效或傷害，本摘要**未評估**證據品質、治療效益、風險或指引一致性，也不是資格判定或治療建議。

### 已確認、去識別的病況脈絡

${facts}

### 試驗比較清單

| 代號 | 登錄編號 | 公開標題 | 比較分類 | 地區 |
|---|---|---|---|---|
${comparisonRows}

${trialSections}

## 病人與家屬討論單

### 這份清單代表什麼

這些研究是依照已確認摘要，從公開登錄資料搜尋而來。綠色或一致只表示部分公開用語看起來相近，不代表符合資格，也不代表研究治療會帶來幫助。

### 仍然不確定的事項

- 完整資格通常仍需病歷、影像、檢驗、治療時間與試驗團隊逐條確認。
- 公開登錄可能不完整或尚未更新。
- 本摘要沒有評估治療效益、副作用、生活品質或其他選擇。
- 可能排除訊號只是提供人工確認的用語交集，不是最終判定。

### 可以詢問照護或試驗團隊的問題

- 這項研究是否適用於我的確切癌症亞型、期別、生物標記與治療史？
- 哪些資格條件無法從公開資料確認？
- 先前或目前治療的時間是否可能造成排除？
- 研究介入、回診頻率、旅行需求、可能風險與其他選擇為何？
- 聯絡試驗中心前需要準備哪些資料？

## 這份摘要不能證明什麼

它不能證明資格、療效、安全性、優越性、指引一致性，也不能判斷參加研究是否適合。最終資格只能由試驗團隊判定，並應與照護團隊討論。
`;

  return { title, markdown, trialCount: matches.length, createdAt, containsConfirmedHealthInformation: true, sent: false };
}
