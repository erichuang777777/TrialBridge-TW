import type { CriterionAssessment, TrialMatch } from "@/lib/matching/engine";
import type { ConfirmedProfile } from "@/lib/profile/schema";
import { conditionBadges, phaseLabel, publishedSiteRegion, recruitmentLabel, regionLabel, sourceScopeLabel, trialPhaseFilter } from "@/lib/trials/presentation";

const criterionOrder: CriterionAssessment["key"][] = ["condition", "recruitment", "age", "sex", "location"];
const criterionLabels = {
  condition: { en: "Disease", "zh-Hant": "疾病" },
  recruitment: { en: "Recruiting", "zh-Hant": "招募" },
  age: { en: "Age", "zh-Hant": "年齡" },
  sex: { en: "Sex", "zh-Hant": "性別" },
  location: { en: "Location", "zh-Hant": "地點" },
  eligibility_details: { en: "Eligibility details", "zh-Hant": "資格細節" },
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

const patientFactGroups = [
  { key: "disease", domains: ["cancer_type", "primary_site"], en: "Disease", zh: "疾病" },
  { key: "subtype", domains: ["histology"], en: "Subtype", zh: "亞型／組織型" },
  { key: "stage", domains: ["stage", "disease_extent"], en: "Stage", zh: "分期" },
  { key: "biomarker", domains: ["biomarker"], en: "Biomarker", zh: "生物標記" },
  { key: "age", domains: ["age_band"], en: "Age", zh: "年齡" },
] as const;

export function TrialMatchCard({ match, profile, language, view, shortlisted, shortlistDisabled, onToggleShortlist, onCreateOutreach }: {
  match: TrialMatch;
  profile: ConfirmedProfile;
  language: "en" | "zh-Hant";
  view: "cards" | "list";
  shortlisted: boolean;
  shortlistDisabled: boolean;
  onToggleShortlist: () => void;
  onCreateOutreach: () => void;
}) {
  const condition = match.assessments.find((assessment) => assessment.key === "condition");
  const phase = trialPhaseFilter(match.trial);
  const registeredConditions = conditionBadges(match.trial.conditions);
  const visibleLocations = [...match.trial.locations].sort((left, right) => Number(right.recruitmentStatus === "RECRUITING") - Number(left.recruitmentStatus === "RECRUITING"));
  const publicContacts = match.trial.contacts.filter((contact) => contact.name && (contact.role === "investigator" || contact.role === "site" || contact.role === "central")).slice(0, 2);
  const patientFacts = patientFactGroups.map((group) => {
    const values = profile.facts.filter((fact) => group.domains.some((domain) => domain === fact.domain)).map((fact) => language === "en" ? fact.displayEn : fact.displayZhHant);
    return { ...group, value: values.join(" · ") };
  });
  return <article className={`visual-match-card ${view === "list" ? "list-match-card" : "card-match-card"} ${shortlisted ? "shortlisted-match-card" : ""}`}>
    <div className="visual-card-header">
      <span className={`overall-status overall-${match.status}`}>{statusLabels[match.status][language]}</span>
      <span className={`recruitment-badge recruitment-${match.trial.recruitment.category}`}>{recruitmentLabel(match.trial, language)}</span>
      <span className="match-source-scope">{sourceScopeLabel(match.trial, language)}</span>
      <span className="registry-id">{match.trial.sources[0].registryId}</span>
    </div>
    <h4>{match.trial.title}</h4>
    <div className="trial-taxonomy-badges" aria-label={language === "en" ? "Trial phase and registered conditions" : "試驗期別與登錄疾病"}>
      <span className={`phase-badge phase-${phase}`}>{phaseLabel(phase, language)}</span>
      {registeredConditions.badges.map((badge) => <span className={`condition-badge condition-${badge.kind}`} key={`${badge.kind}:${badge.label}`}>{badge.label}</span>)}
      {registeredConditions.hiddenCount > 0 && <span className="condition-badge">+{registeredConditions.hiddenCount}</span>}
    </div>
    <div className="card-evidence">
      {condition && <p className="condition-overlap">{language === "en" ? condition.explanationEn : condition.explanationZhHant}</p>}
      {match.potentialExclusions.length > 0 && <div className="potential-exclusion" role="note"><strong>{language === "en" ? "Potential exclusion signal" : "可能排除訊號"}</strong>{match.potentialExclusions.map((signal) => <p key={signal.patientFactId}>{language === "en" ? "Confirmed treatment" : "已確認治療"}: {signal.confirmedIntervention}. {language === "en" ? signal.explanationEn : signal.explanationZhHant}<small>{language === "en" ? "Public exclusion excerpt" : "公開排除條件節錄"}: {signal.registryExcerpt}</small></p>)}</div>}
    </div>
    <div className="patient-fact-strip" aria-label={language === "en" ? "Confirmed patient facts used in this comparison" : "此比較使用的病人確認資料"}>{patientFacts.map((fact) => <div key={fact.key} className={!fact.value ? "fact-missing" : ""}><span>{language === "en" ? fact.en : fact.zh}</span><strong>{fact.value || (language === "en" ? "Missing" : "缺少資料")}</strong></div>)}</div>
    <div className="match-site-summary">
      <div><span>{language === "en" ? "Published site region" : "已公開試驗地點"}</span><strong>{regionLabel(publishedSiteRegion(match.trial), language)}</strong></div>
      {visibleLocations.length > 0 ? <ul>{visibleLocations.slice(0, 2).map((location, index) => <li key={`${location.facility ?? "site"}:${location.city ?? index}`}>{[location.facility, location.city, location.country].filter(Boolean).join(" · ")}{location.recruitmentStatus && <small>{location.recruitmentStatus.replaceAll("_", " ").toLocaleLowerCase("en")}</small>}</li>)}</ul> : <p>{language === "en" ? "No study site is published in this registry record. Check the source or central contact." : "此登錄紀錄未公開試驗地點，請查看來源或洽中央聯絡人。"}</p>}
      {publicContacts.length > 0 && <div className="match-public-contacts"><span>{language === "en" ? "Investigator / contact" : "試驗主持人／聯絡人"}</span>{publicContacts.map((contact, index) => <strong key={`${contact.role}:${contact.name}:${index}`}>{contact.name}{contact.affiliation ? ` · ${contact.affiliation}` : contact.facility ? ` · ${contact.facility}` : ""}</strong>)}</div>}
    </div>
    <div className="match-matrix" role="list" aria-label={language === "en" ? "Five public-record comparisons; focus a block for details" : "五項公開資料比較；將焦點移至色塊可查看細節"}>
      {criterionOrder.map((key) => {
        const assessment = match.assessments.find((item) => item.key === key);
        const outcome = assessment?.outcome ?? "missing";
        const explanation = assessment ? (language === "en" ? assessment.explanationEn : assessment.explanationZhHant) : outcomeLabels.missing[language];
        const label = criterionLabels[key][language];
        const outcomeLabel = outcomeLabels[outcome][language];
        return <div className="criterion-cell" role="listitem" tabIndex={0} key={key} aria-label={`${label}: ${outcomeLabel}. ${explanation}`}>
          <span className={`match-block assessment-${outcome}`} aria-hidden="true" />
          <span className="criterion-tooltip" role="tooltip"><strong>{label} · {outcomeLabel}</strong><small>{explanation}</small></span>
        </div>;
      })}
    </div>
    <details className="assessment-details">
      <summary>{language === "en" ? "Review comparison details" : "查看比較細節"}</summary>
      <ul>{match.assessments.filter((assessment) => assessment.key !== "eligibility_details" || assessment.outcome !== "unknown").map((assessment) => <li key={assessment.key}><strong>{criterionLabels[assessment.key][language]} — {outcomeLabels[assessment.outcome][language]}:</strong> {language === "en" ? assessment.explanationEn : assessment.explanationZhHant}<small>{language === "en" ? "Registry field" : "登錄欄位"}: {assessment.registryField}</small></li>)}</ul>
    </details>
    <div className="visual-card-actions">
      <a href={match.trial.sources[0].url} target="_blank" rel="noreferrer">{language === "en" ? "Open registry" : "查看登錄"}</a>
      <button className="shortlist-toggle" type="button" aria-pressed={shortlisted} disabled={shortlistDisabled} onClick={onToggleShortlist}>{shortlisted ? (language === "en" ? "Added to compare" : "已加入比較") : shortlistDisabled ? (language === "en" ? "Comparison full" : "比較已滿") : (language === "en" ? "Add to compare" : "加入比較")}</button>
      <button onClick={onCreateOutreach}>{language === "en" ? "Contact draft" : "聯絡草稿"}</button>
    </div>
  </article>;
}
