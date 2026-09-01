import type { CriterionAssessment, TrialMatch } from "@/lib/matching/engine";

const comparisonRows: Array<{ key: CriterionAssessment["key"]; en: string; zh: string }> = [
  { key: "condition", en: "Disease", zh: "疾病" },
  { key: "recruitment", en: "Recruiting", zh: "招募" },
  { key: "age", en: "Age", zh: "年齡" },
  { key: "sex", en: "Sex", zh: "性別" },
  { key: "location", en: "Location", zh: "地點" },
  { key: "eligibility_details", en: "Eligibility detail", zh: "資格細節" },
];

const outcomeLabels = {
  possibly_met: { en: "Aligned", "zh-Hant": "相同" },
  possibly_not_met: { en: "Different", "zh-Hant": "不同" },
  unknown: { en: "Uncertain", "zh-Hant": "不確定" },
  missing: { en: "Missing", "zh-Hant": "缺乏資訊" },
} as const;

function AssessmentValue({ match, criterion, language }: { match: TrialMatch; criterion: CriterionAssessment["key"]; language: "en" | "zh-Hant" }) {
  const assessment = match.assessments.find((item) => item.key === criterion);
  const outcome = assessment?.outcome ?? "missing";
  const explanation = assessment ? (language === "en" ? assessment.explanationEn : assessment.explanationZhHant) : outcomeLabels.missing[language];
  return <div className="shortlist-assessment"><span className={`shortlist-state assessment-${outcome}`} aria-hidden="true" /><div><strong>{outcomeLabels[outcome][language]}</strong><small>{explanation}</small></div></div>;
}

function ExclusionValue({ match, language }: { match: TrialMatch; language: "en" | "zh-Hant" }) {
  const signal = match.potentialExclusions[0];
  return <div className="shortlist-assessment"><span className={`shortlist-state assessment-${signal ? "possibly_not_met" : "missing"}`} aria-hidden="true" /><div><strong>{signal ? (language === "en" ? "Potential signal" : "可能訊號") : (language === "en" ? "None found" : "未找到")}</strong><small>{signal ? (language === "en" ? signal.explanationEn : signal.explanationZhHant) : (language === "en" ? "No treatment overlap was found in the current public text; this is not an eligibility decision." : "目前公開文字未找到治療用語交集；這不是資格判定。")}</small></div></div>;
}

export function TrialShortlistPanel({ matches, language, onRemove, onClear }: { matches: TrialMatch[]; language: "en" | "zh-Hant"; onRemove: (trialId: string) => void; onClear: () => void }) {
  const ready = matches.length >= 2;
  const countLabel = language === "en" ? `${matches.length} of 3 selected` : `已選 ${matches.length}/3`;
  return <section className={`shortlist-panel ${ready ? "shortlist-ready" : ""}`} aria-labelledby="shortlist-title">
    <div className="shortlist-heading"><div><p className="eyebrow">{language === "en" ? "Human-controlled shortlist" : "由使用者控制的 shortlist"}</p><h4 id="shortlist-title">{language === "en" ? "Compare up to three trials" : "並排比較最多三項試驗"}</h4><p>{matches.length === 0 ? (language === "en" ? "Use Add to compare on any result card. Two selections unlock the comparison and its WebMCP tool." : "在結果卡選擇「加入比較」；選滿兩項後會開啟比較與對應 WebMCP 工具。") : ready ? (language === "en" ? "The same visible selection is available to the read-only WebMCP comparison tool when permission is on." : "開啟授權後，同一組可見選擇會提供給唯讀 WebMCP 比較工具。") : (language === "en" ? "Choose one more trial to unlock comparison." : "再選一項即可開始比較。")}</p></div><div className="shortlist-count"><strong role="status" aria-atomic="true">{countLabel}</strong>{matches.length > 0 && <button type="button" onClick={onClear}>{language === "en" ? "Clear" : "清除"}</button>}</div></div>
    {matches.length > 0 && <ul className="shortlist-chips" aria-label={language === "en" ? "Selected trials" : "已選試驗"}>{matches.map((match) => <li key={match.trial.canonicalId}><span><strong>{match.trial.sources[0].registryId}</strong>{match.trial.title}</span><button type="button" onClick={() => onRemove(match.trial.canonicalId)} aria-label={language === "en" ? `Remove ${match.trial.title} from comparison` : `從比較移除 ${match.trial.title}`}>{language === "en" ? "Remove" : "移除"}</button></li>)}</ul>}
    {ready && <>
      <div className="shortlist-table-wrap"><table><caption className="sr-only">{language === "en" ? "Public-record comparison of selected trials" : "已選試驗的公開資料比較"}</caption><thead><tr><th scope="col">{language === "en" ? "Criterion" : "比較項目"}</th>{matches.map((match) => <th scope="col" key={match.trial.canonicalId}><span>{match.trial.sources[0].registryId}</span>{match.trial.title}</th>)}</tr></thead><tbody>{comparisonRows.map((row) => <tr key={row.key}><th scope="row">{language === "en" ? row.en : row.zh}</th>{matches.map((match) => <td key={match.trial.canonicalId}><AssessmentValue match={match} criterion={row.key} language={language} /></td>)}</tr>)}<tr><th scope="row">{language === "en" ? "Treatment exclusion signal" : "治療排除訊號"}</th>{matches.map((match) => <td key={match.trial.canonicalId}><ExclusionValue match={match} language={language} /></td>)}</tr></tbody></table></div>
      <div className="shortlist-mobile-cards">{matches.map((match) => <article key={match.trial.canonicalId}><div><span>{match.trial.sources[0].registryId}</span><h5>{match.trial.title}</h5></div><dl>{comparisonRows.map((row) => <div key={row.key}><dt>{language === "en" ? row.en : row.zh}</dt><dd><AssessmentValue match={match} criterion={row.key} language={language} /></dd></div>)}<div><dt>{language === "en" ? "Treatment exclusion signal" : "治療排除訊號"}</dt><dd><ExclusionValue match={match} language={language} /></dd></div></dl></article>)}</div>
      <p className="shortlist-boundary">{language === "en" ? "Public-record comparison only. Missing, uncertain, or apparently aligned fields still require the study team’s review." : "僅比較公開登錄資料；缺漏、不確定或看似相同的欄位仍需由試驗團隊確認。"}</p>
    </>}
  </section>;
}
