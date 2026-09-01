import type { ProfileDraft } from "@/lib/profile/schema";
import type { MaskResult } from "@/lib/privacy/mask";

export function SummaryConfirmation({ draft, maskResult, language, model, edits, checked, onEdit, onCheck, onCheckAll, onBack, onFinish }: {
  draft: ProfileDraft;
  maskResult: MaskResult;
  language: "en" | "zh-Hant";
  model?: string;
  edits: Record<string, string>;
  checked: Record<string, boolean>;
  onEdit: (id: string, value: string) => void;
  onCheck: (id: string, value: boolean) => void;
  onCheckAll: () => void;
  onBack: () => void;
  onFinish: () => void;
}) {
  const confirmedCount = draft.facts.filter((fact) => checked[fact.id]).length;
  const allChecked = draft.facts.length > 0 && confirmedCount === draft.facts.length;
  return <div className="chat-turn compact-confirmation">
    <div className="confirmation-heading">
      <div><h3>{language === "en" ? "Review masked note and confirm summary" : "對照遮蔽內容並確認摘要"}</h3><p>{language === "en" ? "Correct any extracted fact, then confirm individually or all at once." : "請先修正不正確的項目，再逐項或一鍵全部確認。"}</p></div>
      <div className="confirmation-actions"><span role="status" aria-live="polite">{confirmedCount}/{draft.facts.length}</span><button type="button" disabled={allChecked} onClick={onCheckAll}>{allChecked ? (language === "en" ? "All confirmed" : "已全部確認") : (language === "en" ? "Confirm all" : "一鍵全部確認")}</button></div>
    </div>
    {model && <p className="model-receipt">{language === "en" ? "Cloud model" : "雲端模型"}: {model}</p>}
    <div className="confirmation-workspace">
      <section className="masked-summary-panel" aria-labelledby="masked-note-title">
        <div className="review-panel-heading"><h4 id="masked-note-title">{language === "en" ? "Masked note sent to cloud" : "送往雲端的遮蔽內容"}</h4><span>{maskResult.findings.length} {language === "en" ? "masked" : "項遮蔽"}</span></div>
        <pre className="masked-preview">{maskResult.maskedText}</pre>
        <button type="button" onClick={onBack}>{language === "en" ? "Edit masked note" : "修改遮蔽內容"}</button>
      </section>
      <section className="summary-facts-panel" aria-labelledby="summary-facts-title">
        <h4 id="summary-facts-title">{language === "en" ? "Extracted summary" : "抽取摘要"}</h4>
        <div className="fact-list">{draft.facts.map((fact) => <div className="fact-editor" key={fact.id}><div className="fact-editor-heading"><label htmlFor={fact.id}>{fact.domain.replaceAll("_", " ")}</label><label className="compact-check"><input type="checkbox" checked={Boolean(checked[fact.id])} onChange={(event) => onCheck(fact.id, event.target.checked)} /><span>{language === "en" ? "Confirmed" : "已確認"}</span></label></div><textarea id={fact.id} rows={1} value={edits[fact.id] ?? fact.value} onChange={(event) => onEdit(fact.id, event.target.value)} /></div>)}</div>
      </section>
    </div>
    <button className="primary-action confirmation-submit" disabled={!allChecked} onClick={onFinish}>{language === "en" ? "Create confirmed summary" : "建立已確認摘要"}</button>
  </div>;
}
