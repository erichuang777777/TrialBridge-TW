import type { CriterionAssessment, TrialMatch } from "@/lib/matching/engine";

const criterionOrder: CriterionAssessment["key"][] = ["condition", "recruitment", "age", "sex", "location", "eligibility_details"];
const criterionLabels = {
  condition: { en: "Disease", "zh-Hant": "疾病" },
  recruitment: { en: "Recruiting", "zh-Hant": "招募" },
  age: { en: "Age", "zh-Hant": "年齡" },
  sex: { en: "Sex", "zh-Hant": "性別" },
  location: { en: "Location", "zh-Hant": "地點" },
  eligibility_details: { en: "Other", "zh-Hant": "其他" },
} as const;
const outcomeLabels = {
  possibly_met: { en: "Aligned", "zh-Hant": "相同" },
  possibly_not_met: { en: "Different", "zh-Hant": "不同" },
  unknown: { en: "Uncertain", "zh-Hant": "不確定" },
  missing: { en: "Missing", "zh-Hant": "缺乏資訊" },
} as const;
const statusLabels = {
  discuss: { en: "Discuss", "zh-Hant": "可進一步討論" },
  needs_review: { en: "Needs criterion review", "zh-Hant": "需要逐條確認" },
  needs_information: { en: "Needs information", "zh-Hant": "需要更多資訊" },
  unlikely_based_on_public_record: { en: "Public mismatch found", "zh-Hant": "公開資料發現差異" },
} as const;

export function MatchLegend({ language }: { language: "en" | "zh-Hant" }) {
  return <div className="match-legend" aria-label={language === "en" ? "Comparison color legend" : "比較色彩圖例"}>{Object.entries(outcomeLabels).map(([outcome, labels]) => <span key={outcome}><i className={`legend-swatch assessment-${outcome}`} aria-hidden="true" />{labels[language]}</span>)}</div>;
}

export function TrialMatchCard({ match, language, view, onCreateOutreach }: {
  match: TrialMatch;
  language: "en" | "zh-Hant";
  view: "cards" | "list";
  onCreateOutreach: () => void;
}) {
  const condition = match.assessments.find((assessment) => assessment.key === "condition");
  return <article className={`visual-match-card ${view === "list" ? "list-match-card" : "card-match-card"}`}>
    <div className="visual-card-header">
      <span className={`overall-status overall-${match.status}`}>{statusLabels[match.status][language]}</span>
      <span className="registry-id">{match.trial.sources[0].registryId}</span>
    </div>
    <h4>{match.trial.title}</h4>
    <div className="card-evidence">
      {condition && <p className="condition-overlap">{language === "en" ? condition.explanationEn : condition.explanationZhHant}</p>}
      {match.potentialExclusions.length > 0 && <div className="potential-exclusion" role="note"><strong>{language === "en" ? "Potential exclusion signal" : "可能排除訊號"}</strong>{match.potentialExclusions.map((signal) => <p key={signal.patientFactId}>{language === "en" ? "Confirmed treatment" : "已確認治療"}: {signal.confirmedIntervention}. {language === "en" ? signal.explanationEn : signal.explanationZhHant}<small>{language === "en" ? "Public exclusion excerpt" : "公開排除條件節錄"}: {signal.registryExcerpt}</small></p>)}</div>}
    </div>
    <div className="match-matrix" role="list" aria-label={language === "en" ? "Six public-record comparisons" : "六項公開資料比較"}>
      {criterionOrder.map((key) => {
        const assessment = match.assessments.find((item) => item.key === key);
        const outcome = assessment?.outcome ?? "missing";
        const explanation = assessment ? (language === "en" ? assessment.explanationEn : assessment.explanationZhHant) : outcomeLabels.missing[language];
        return <div className="criterion-cell" role="listitem" key={key} title={explanation}>
          <span className={`match-block assessment-${outcome}`} aria-hidden="true" />
          <strong>{criterionLabels[key][language]}</strong>
          <small>{outcomeLabels[outcome][language]}</small>
        </div>;
      })}
    </div>
    <details className="assessment-details">
      <summary>{language === "en" ? "Review comparison details" : "查看比較細節"}</summary>
      <ul>{match.assessments.map((assessment) => <li key={assessment.key}><strong>{criterionLabels[assessment.key][language]} — {outcomeLabels[assessment.outcome][language]}:</strong> {language === "en" ? assessment.explanationEn : assessment.explanationZhHant}<small>{language === "en" ? "Registry field" : "登錄欄位"}: {assessment.registryField}</small></li>)}</ul>
    </details>
    <div className="visual-card-actions">
      <a href={match.trial.sources[0].url} target="_blank" rel="noreferrer">{language === "en" ? "Open registry" : "查看登錄"}</a>
      <button onClick={onCreateOutreach}>{language === "en" ? "Contact draft" : "聯絡草稿"}</button>
    </div>
  </article>;
}
