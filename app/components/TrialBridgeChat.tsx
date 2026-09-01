"use client";

import { useMemo, useReducer, useState } from "react";
import { chatReducer, initialChatState } from "@/lib/chat/state";
import { maskDirectIdentifiers } from "@/lib/privacy/mask";
import { confirmProfile, profileDraftSchema } from "@/lib/profile/schema";

const copy = {
  "zh-Hant": {
    heading: "從一段對話開始", patient: "我是病人", caregiver: "我是家屬或照顧者",
    privacy: "您的原文只留在目前頁面。送往本機模型前，會先遮蔽可辨識資訊；遮蔽不可能百分之百準確，請務必檢查預覽。",
    accept: "我了解，繼續", prompt: "請貼上病歷摘要，或用自己的話描述目前狀況",
    helper: "請避免輸入姓名；系統會嘗試遮蔽身分證、電話、Email、病歷號與明確標示的生日或地址。",
    review: "檢查遮蔽後內容", extract: "內容正確，交給本機模型整理", back: "返回修改原文",
    working: "本機模型正在整理，CPU 模式可能需要約一分鐘。請不要關閉頁面。",
    confirm: "逐項確認整理結果", confirmAll: "每一項都要勾選；若不正確，請先修改。",
    finish: "全部確認並建立摘要", ready: "摘要已由您確認", clear: "清除此匿名對話",
  },
  en: {
    heading: "Start with a conversation", patient: "I am the patient", caregiver: "I am a caregiver",
    privacy: "Your original text stays on this page. Identifiers are masked before local-model processing. Masking cannot be perfect, so review the preview carefully.",
    accept: "I understand — continue", prompt: "Paste a medical summary or describe the current situation",
    helper: "Avoid names. The browser attempts to mask IDs, phone numbers, email, record numbers, labelled birth dates and addresses.",
    review: "Review masked content", extract: "Looks right — organize locally", back: "Edit original text",
    working: "The local model is organizing the note. CPU mode may take about a minute. Keep this page open.",
    confirm: "Confirm each extracted fact", confirmAll: "Check every fact; edit anything that is not correct first.",
    finish: "Confirm all and create summary", ready: "You confirmed this summary", clear: "Clear this anonymous conversation",
  },
};

export function TrialBridgeChat() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const t = copy[state.language];
  const allChecked = Boolean(state.draft?.facts.length) && state.draft!.facts.every((fact) => checked[fact.id]);
  const step = useMemo(() => ({ role: 1, privacy: 1, capture: 2, mask_review: 2, extracting: 2, confirmation: 3, ready: 3 }[state.stage]), [state.stage]);

  async function extract() {
    if (!state.maskResult || !state.subjectRole) return;
    dispatch({ type: "EXTRACTION_START" });
    try {
      const response = await fetch("/api/local-model/extract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maskedText: state.maskResult.maskedText, subjectRole: state.subjectRole, language: state.language }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || typeof payload !== "object" || payload === null || !("draft" in payload)) throw new Error("Local model is unavailable or returned an invalid draft.");
      const draft = profileDraftSchema.parse((payload as { draft: unknown }).draft);
      setEdits(Object.fromEntries(draft.facts.map((fact) => [fact.id, fact.value])));
      dispatch({ type: "EXTRACTION_SUCCESS", draft });
    } catch (error) {
      dispatch({ type: "EXTRACTION_FAILURE", message: error instanceof Error ? error.message : "Extraction failed." });
    }
  }

  function finishConfirmation() {
    if (!state.draft || !allChecked || !state.subjectRole) return;
    const profile = confirmProfile(state.draft, Object.fromEntries(state.draft.facts.map((fact) => [fact.id, {
      value: edits[fact.id] ?? fact.value,
      displayZhHant: state.language === "zh-Hant" ? edits[fact.id] ?? fact.displayZhHant : fact.displayZhHant,
      displayEn: state.language === "en" ? edits[fact.id] ?? fact.displayEn : fact.displayEn,
    }])), state.subjectRole);
    dispatch({ type: "CONFIRM_SUCCESS", profile });
  }

  return (
    <section className="chat-shell" id="private-chat" aria-labelledby="chat-title">
      <div className="chat-heading"><div><p className="eyebrow">Chat-first intake</p><h2 id="chat-title">{t.heading}</h2></div><span>Step {step}/3</span></div>
      {state.stage === "role" && <div className="chat-turn"><div className="language-switch" aria-label="Language"><button className={state.language === "zh-Hant" ? "selected" : ""} onClick={() => dispatch({ type: "SET_LANGUAGE", language: "zh-Hant" })}>繁中</button><button className={state.language === "en" ? "selected" : ""} onClick={() => dispatch({ type: "SET_LANGUAGE", language: "en" })}>English</button></div><div className="choice-grid"><button onClick={() => dispatch({ type: "SELECT_ROLE", role: "patient" })}>{t.patient}</button><button onClick={() => dispatch({ type: "SELECT_ROLE", role: "caregiver" })}>{t.caregiver}</button></div></div>}
      {state.stage === "privacy" && <div className="chat-turn"><p>{t.privacy}</p>{state.subjectRole === "caregiver" && <p className="notice">請只提供您獲得授權且能確認的資訊；不確定時請選擇未知。</p>}<button className="primary-action" onClick={() => dispatch({ type: "ACCEPT_PRIVACY" })}>{t.accept}</button></div>}
      {state.stage === "capture" && <div className="chat-turn"><label htmlFor="medical-note">{t.prompt}</label><textarea id="medical-note" value={state.rawText} onChange={(event) => dispatch({ type: "SET_RAW_TEXT", value: event.target.value })} aria-describedby="note-helper" rows={9} /><p id="note-helper" className="field-helper">{t.helper}</p><button className="primary-action" disabled={state.rawText.trim().length < 20} onClick={() => dispatch({ type: "MASK_COMPLETE", result: maskDirectIdentifiers(state.rawText) })}>{t.review}</button></div>}
      {state.stage === "mask_review" && state.maskResult && <div className="chat-turn"><h3>{t.review}</h3><pre className="masked-preview">{state.maskResult.maskedText}</pre><p className="field-helper">Masked items: {state.maskResult.findings.length}. {state.error}</p><div className="action-row"><button onClick={() => dispatch({ type: "BACK_TO_CAPTURE" })}>{t.back}</button><button className="primary-action" onClick={extract}>{t.extract}</button></div></div>}
      {state.stage === "extracting" && <div className="chat-turn" role="status" aria-live="polite"><div className="progress-bar" /><p>{t.working}</p></div>}
      {state.stage === "confirmation" && state.draft && <div className="chat-turn"><h3>{t.confirm}</h3><p>{t.confirmAll}</p><div className="fact-list">{state.draft.facts.map((fact) => <div className="fact-editor" key={fact.id}><label htmlFor={fact.id}>{fact.domain.replaceAll("_", " ")}</label><textarea id={fact.id} rows={2} value={edits[fact.id] ?? fact.value} onChange={(event) => setEdits({ ...edits, [fact.id]: event.target.value })} /><label className="confirm-check"><input type="checkbox" checked={Boolean(checked[fact.id])} onChange={(event) => setChecked({ ...checked, [fact.id]: event.target.checked })} /> {state.language === "en" ? "I confirm this fact" : "我確認這項資料正確"}</label></div>)}</div><button className="primary-action" disabled={!allChecked} onClick={finishConfirmation}>{t.finish}</button></div>}
      {state.stage === "ready" && state.confirmedProfile && <div className="chat-turn"><h3>{t.ready}</h3><dl className="confirmed-summary">{state.confirmedProfile.facts.map((fact) => <div key={fact.id}><dt>{fact.domain.replaceAll("_", " ")}</dt><dd>{state.language === "en" ? fact.displayEn : fact.displayZhHant}</dd></div>)}</dl><p className="notice">下一階段才會使用這份確認摘要進行試驗配對；原始文字已從流程狀態移除。</p><button onClick={() => { setChecked({}); setEdits({}); dispatch({ type: "RESET" }); }}>{t.clear}</button></div>}
    </section>
  );
}
