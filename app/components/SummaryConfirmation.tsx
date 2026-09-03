import type { ProfileDraft } from "@/lib/profile/schema";
import type { MaskResult } from "@/lib/privacy/mask";
import type { CloudExtractionReceipt } from "@/lib/llm/extractionReceipt";

export function SummaryConfirmation({ draft, maskResult, language, receipt, edits, checked, completed = false, onEdit, onCheck, onCheckAll, onBack, onFinish }: {
  draft: ProfileDraft;
  maskResult: MaskResult;
  language: "en" | "zh-Hant";
  receipt?: CloudExtractionReceipt;
  edits: Record<string, string>;
  checked: Record<string, boolean>;
  completed?: boolean;
  onEdit: (id: string, value: string) => void;
  onCheck: (id: string, value: boolean) => void;
  onCheckAll: () => void;
  onBack: () => void;
  onFinish: () => void;
}) {
  const confirmedCount = draft.facts.filter((fact) => checked[fact.id]).length;
  const allChecked = draft.facts.length > 0 && confirmedCount === draft.facts.length;
  const reviewPriority = (domain: string, confidence: number) => {
    if (["prior_therapy", "current_therapy", "treatment_date"].includes(domain)) return language === "en" ? "Treatment detail — verify exact name and timing" : "治療資訊—請核對正確名稱與時間";
    if (["histology", "stage", "disease_extent", "biomarker"].includes(domain)) return language === "en" ? "Clinical detail — check against the report" : "臨床關鍵欄位—請對照報告原文";
    if (confidence < 0.8) return language === "en" ? "Lower model confidence — review carefully" : "模型信心較低—請仔細複核";
    return undefined;
  };
  return <div className="chat-turn compact-confirmation">
    <div className="confirmation-heading">
      <div><h3>{language === "en" ? "Review masked note and confirm summary" : "對照遮蔽內容並確認摘要"}</h3><p>{language === "en" ? "Correct any extracted fact, then confirm individually or all at once." : "請先修正不正確的項目，再逐項或一鍵全部確認。"}</p></div>
    </div>
    {receipt && <section className="extraction-receipt" aria-labelledby="extraction-receipt-title"><div><strong id="extraction-receipt-title">{language === "en" ? "Cloud extraction receipt" : "雲端整理收據"}</strong><span>{receipt.transport === "ollama_cloud_api" ? (language === "en" ? "Ollama Cloud API (HTTPS) → remote cloud" : "Ollama Cloud API（HTTPS）→ 遠端雲端") : (language === "en" ? "localhost Ollama proxy → remote cloud" : "localhost Ollama proxy → 遠端雲端")}</span></div><dl><div><dt>{language === "en" ? "Requested" : "指定模型"}</dt><dd>{receipt.requestedModel}</dd></div><div><dt>{language === "en" ? "Provider reported" : "供應端回報"}</dt><dd>{receipt.reportedModel ?? (language === "en" ? "Not reported" : "未回報")}</dd></div><div><dt>{language === "en" ? "Elapsed" : "處理時間"}</dt><dd>{(receipt.latencyMs / 1_000).toFixed(1)}s</dd></div><div><dt>{language === "en" ? "TrialBridge storage" : "TrialBridge 儲存"}</dt><dd>{language === "en" ? "Not saved" : "未儲存"}</dd></div></dl><p>{language === "en" ? "The request used the masked note. Provider retention is not assessed." : "請求使用遮蔽後內容；尚未評估供應端保存政策。"}</p></section>}
    <div className="confirmation-workspace">
      <section className="masked-summary-panel" aria-labelledby="masked-note-title">
        <div className="review-panel-heading"><div className="panel-heading-copy"><span className="panel-step" aria-hidden="true">1</span><div><h4 id="masked-note-title">{language === "en" ? "Masked note" : "遮蔽後內容"}</h4><p>{language === "en" ? "Content reviewed before cloud organization" : "送往雲端整理前的內容"}</p></div></div><span>{maskResult.findings.length} {language === "en" ? "masked" : "項遮蔽"}</span></div>
        <pre className="masked-preview">{maskResult.maskedText}</pre>
        {!completed && <button type="button" onClick={onBack}>{language === "en" ? "Edit source note" : "修改來源內容"}</button>}
      </section>
      <section className="summary-facts-panel" aria-labelledby="summary-facts-title">
        <div className="review-panel-heading"><div className="panel-heading-copy"><span className="panel-step" aria-hidden="true">2</span><div><h4 id="summary-facts-title">{language === "en" ? "Extracted facts" : "抽取欄位"}</h4><p>{receipt ? `${language === "en" ? "Organized by" : "整理模型"} ${receipt.requestedModel}` : (language === "en" ? "Review every field" : "請檢查每個欄位")}</p></div></div><div className="summary-confirm-controls"><span role="status" aria-live="polite">{language === "en" ? "Confirmed" : "已確認"} {confirmedCount}/{draft.facts.length}</span>{!completed && <button type="button" disabled={allChecked} onClick={onCheckAll}>{allChecked ? (language === "en" ? "All confirmed" : "已全部確認") : (language === "en" ? "Confirm all" : "一鍵全部確認")}</button>}</div></div>
        <div className="fact-list">{draft.facts.map((fact) => { const priority = reviewPriority(fact.domain, fact.confidence); return <div className={`fact-editor ${priority ? "review-priority-row" : ""}`} key={fact.id}><div className="fact-label-cell"><label className="fact-domain-label" htmlFor={fact.id}>{fact.domain.replaceAll("_", " ")}</label>{priority && <span className="review-priority">{priority}</span>}</div><textarea id={fact.id} rows={1} readOnly={completed} value={edits[fact.id] ?? fact.value} onChange={(event) => onEdit(fact.id, event.target.value)} /><label className="compact-check" title={language === "en" ? `Confirm ${fact.domain.replaceAll("_", " ")}` : `確認 ${fact.domain.replaceAll("_", " ")}`}><input type="checkbox" disabled={completed} checked={Boolean(checked[fact.id])} onChange={(event) => onCheck(fact.id, event.target.checked)} /><span className="sr-only">{language === "en" ? `Confirmed ${fact.domain.replaceAll("_", " ")}` : `已確認 ${fact.domain.replaceAll("_", " ")}`}</span></label></div>; })}</div>
      </section>
    </div>
    {!completed && <button className="primary-action confirmation-submit" disabled={!allChecked} onClick={onFinish}>{language === "en" ? "Use this summary and continue" : "使用此摘要並繼續"}</button>}
  </div>;
}
