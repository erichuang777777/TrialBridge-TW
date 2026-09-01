"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { chatReducer, initialChatState } from "@/lib/chat/state";
import { maskDirectIdentifiers } from "@/lib/privacy/mask";
import { confirmProfile, profileDraftSchema, setCloudUseApproval } from "@/lib/profile/schema";
import { createOutreachDraft } from "@/lib/matching/outreach";
import type { TrialMatch } from "@/lib/matching/engine";
import { WebMcpBridge } from "./WebMcpBridge";

const copy = {
  "zh-Hant": {
    heading: "從一段對話開始", patient: "我是病人", caregiver: "我是家屬或照顧者",
    privacy: "您的原文只留在目前頁面。瀏覽器會先遮蔽可辨識資訊；經您檢查並同意後，遮蔽內容會透過 localhost Ollama proxy 傳送至 gpt-oss:120b-cloud。遮蔽不可能百分之百準確。",
    accept: "我了解，繼續", prompt: "請貼上病歷摘要，或用自己的話描述目前狀況",
    helper: "請避免輸入姓名；系統會嘗試遮蔽身分證、電話、Email、病歷號與明確標示的生日或地址。",
    review: "檢查遮蔽後內容", extract: "同意傳送遮蔽內容至雲端並整理", back: "返回修改原文",
    cloudConsent: "我了解 localhost 只是代理，並同意將上方遮蔽後的醫療內容傳送至 gpt-oss:120b-cloud 進行整理。",
    cloudWorking: "gpt-oss:120b-cloud 正在整理內容",
    waiting: "正在透過 localhost Ollama proxy 等待雲端回覆", timeoutHint: "仍在等待；120 秒後會停止，不會無限卡住。",
    expected: "短篇病歷通常約 30–90 秒；較長內容最晚 120 秒停止。", remaining: "距離自動停止最多還有", cancel: "取消並返回", elapsed: "已經過",
    confirm: "逐項確認整理結果", confirmAll: "每一項都要勾選；若不正確，請先修改。",
    finish: "全部確認並建立摘要", ready: "摘要已由您確認", clear: "清除此匿名對話",
  },
  en: {
    heading: "Start with a conversation", patient: "I am the patient", caregiver: "I am a caregiver",
    privacy: "Your original text stays on this page. The browser masks identifiers first. After you review and consent, the masked content is sent through the localhost Ollama proxy to gpt-oss:120b-cloud. Masking cannot be perfect.",
    accept: "I understand — continue", prompt: "Paste a medical summary or describe the current situation",
    helper: "Avoid names. The browser attempts to mask IDs, phone numbers, email, record numbers, labelled birth dates and addresses.",
    review: "Review masked content", extract: "Consent and send masked content to cloud", back: "Edit original text",
    cloudConsent: "I understand that localhost is only a proxy and consent to sending the masked medical content above to gpt-oss:120b-cloud for organization.",
    cloudWorking: "gpt-oss:120b-cloud is organizing the content",
    waiting: "Waiting for the cloud response through the localhost Ollama proxy", timeoutHint: "Still waiting; the request will stop at 120 seconds instead of hanging indefinitely.",
    expected: "Short notes usually take about 30–90 seconds; longer notes stop at 120 seconds.", remaining: "Automatic stop in no more than", cancel: "Cancel and go back", elapsed: "Elapsed",
    confirm: "Confirm each extracted fact", confirmAll: "Check every fact; edit anything that is not correct first.",
    finish: "Confirm all and create summary", ready: "You confirmed this summary", clear: "Clear this anonymous conversation",
  },
};

export function TrialBridgeChat() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [matches, setMatches] = useState<TrialMatch[]>([]);
  const [matching, setMatching] = useState(false);
  const [outreach, setOutreach] = useState<{ subject: string; body: string; sent: false }>();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [webMcpConsent, setWebMcpConsent] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cloudExtractionConsent, setCloudExtractionConsent] = useState(false);
  const [extractionRuntime, setExtractionRuntime] = useState<{ model: string; remote: true }>();
  const extractionController = useRef<AbortController | null>(null);
  const t = copy[state.language];
  const allChecked = Boolean(state.draft?.facts.length) && state.draft!.facts.every((fact) => checked[fact.id]);
  const step = useMemo(() => ({ role: 1, privacy: 1, capture: 2, mask_review: 2, extracting: 2, confirmation: 3, ready: 3 }[state.stage]), [state.stage]);

  useEffect(() => {
    if (state.stage !== "extracting") return;
    setElapsedSeconds(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [state.stage]);

  async function extract() {
    if (!state.maskResult || !state.subjectRole || !cloudExtractionConsent) return;
    extractionController.current?.abort();
    const controller = new AbortController();
    extractionController.current = controller;
    dispatch({ type: "EXTRACTION_START" });
    try {
      const response = await fetch("/api/cloud/extract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maskedText: state.maskResult.maskedText, subjectRole: state.subjectRole, language: state.language, cloudUseApproved: true }),
        signal: controller.signal,
      });
      const payload = await response.json() as { draft?: unknown; error?: string; model?: string; remote?: true };
      if (!response.ok || !payload.draft) {
        throw new Error(payload.error ?? "The cloud model is unavailable or returned an invalid draft.");
      }
      const draft = profileDraftSchema.parse(payload.draft);
      if (payload.model && payload.remote) setExtractionRuntime({ model: payload.model, remote: true });
      setEdits(Object.fromEntries(draft.facts.map((fact) => [fact.id, fact.value])));
      dispatch({ type: "EXTRACTION_SUCCESS", draft });
    } catch (error) {
      if (controller.signal.aborted) return;
      dispatch({ type: "EXTRACTION_FAILURE", message: error instanceof Error ? error.message : "Extraction failed." });
    } finally {
      if (extractionController.current === controller) extractionController.current = null;
    }
  }

  function cancelExtraction() {
    extractionController.current?.abort();
    extractionController.current = null;
    dispatch({ type: "EXTRACTION_CANCEL" });
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

  async function runMatching() {
    if (!state.confirmedProfile) return;
    setMatching(true);
    setOutreach(undefined);
    try {
      const response = await fetch("/api/matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: state.confirmedProfile }) });
      const payload = await response.json() as { matches?: TrialMatch[]; error?: string };
      if (!response.ok || !payload.matches) throw new Error(payload.error ?? "Matching failed.");
      setMatches(payload.matches);
    } catch (error) {
      setMatches([]);
      setOutreach({ subject: "Error", body: error instanceof Error ? error.message : "Matching failed.", sent: false });
    } finally { setMatching(false); }
  }

  async function askCloud() {
    if (!state.confirmedProfile?.cloudUseApproved || question.trim().length < 2) return;
    setAnswer(state.language === "en" ? "Asking gpt-oss:120b-cloud through the local Ollama proxy…" : "正在透過本機 Ollama proxy 詢問 gpt-oss:120b-cloud…");
    const trials = matches.slice(0, 5).map((match) => ({ registryId: match.trial.sources[0].registryId, title: match.trial.title, status: match.status, sourceUrl: match.trial.sources[0].url }));
    try {
      const response = await fetch("/api/cloud/dialogue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: state.confirmedProfile, question, trials, language: state.language }) });
      const payload = await response.json() as { answer?: string; error?: string };
      setAnswer(response.ok && payload.answer ? payload.answer : payload.error ?? "Cloud dialogue failed.");
    } catch { setAnswer("Cloud dialogue failed. Please retry or continue without it."); }
  }

  return (
    <section className="chat-shell" id="private-chat" aria-labelledby="chat-title">
      <WebMcpBridge profile={state.confirmedProfile} matches={matches} sensitiveConsent={webMcpConsent} />
      <div className="chat-heading"><div><p className="eyebrow">Chat-first intake</p><h2 id="chat-title">{t.heading}</h2></div><span>Step {step}/3</span></div>
      {state.stage === "role" && <div className="chat-turn"><div className="language-switch" aria-label="Language"><button className={state.language === "en" ? "selected" : ""} onClick={() => dispatch({ type: "SET_LANGUAGE", language: "en" })}>English</button><button className={state.language === "zh-Hant" ? "selected" : ""} onClick={() => dispatch({ type: "SET_LANGUAGE", language: "zh-Hant" })}>繁中</button></div><div className="choice-grid"><button onClick={() => dispatch({ type: "SELECT_ROLE", role: "patient" })}>{t.patient}</button><button onClick={() => dispatch({ type: "SELECT_ROLE", role: "caregiver" })}>{t.caregiver}</button></div></div>}
      {state.stage === "privacy" && <div className="chat-turn"><p>{t.privacy}</p>{state.subjectRole === "caregiver" && <p className="notice">{state.language === "en" ? "Share only information you are authorized to provide and can verify. Choose unknown when unsure." : "請只提供您獲得授權且能確認的資訊；不確定時請選擇未知。"}</p>}<button className="primary-action" onClick={() => dispatch({ type: "ACCEPT_PRIVACY" })}>{t.accept}</button></div>}
      {state.stage === "capture" && <div className="chat-turn"><label htmlFor="medical-note">{t.prompt}</label><textarea id="medical-note" value={state.rawText} onChange={(event) => dispatch({ type: "SET_RAW_TEXT", value: event.target.value })} aria-describedby="note-helper" rows={9} /><p id="note-helper" className="field-helper">{t.helper}</p><button className="primary-action" disabled={state.rawText.trim().length < 20} onClick={() => { setCloudExtractionConsent(false); dispatch({ type: "MASK_COMPLETE", result: maskDirectIdentifiers(state.rawText) }); }}>{t.review}</button></div>}
      {state.stage === "mask_review" && state.maskResult && <div className="chat-turn"><h3>{t.review}</h3><pre className="masked-preview">{state.maskResult.maskedText}</pre><p className="field-helper">{state.language === "en" ? "Masked items" : "已遮蔽項目"}: {state.maskResult.findings.length}.</p><div className="cloud-consent"><strong>{state.language === "en" ? "Cloud transfer" : "雲端傳輸"}</strong><label className="confirm-check"><input type="checkbox" checked={cloudExtractionConsent} onChange={(event) => setCloudExtractionConsent(event.target.checked)} />{t.cloudConsent}</label></div>{state.error && <div className="error-panel" role="alert"><strong>{state.language === "en" ? "Cloud extraction stopped" : "雲端整理已停止"}</strong><p>{state.error}</p></div>}<div className="action-row"><button onClick={() => { setCloudExtractionConsent(false); dispatch({ type: "BACK_TO_CAPTURE" }); }}>{t.back}</button><button className="primary-action" disabled={!cloudExtractionConsent} onClick={extract}>{t.extract}</button></div></div>}
      {state.stage === "extracting" && <div className="chat-turn extraction-progress" role="status" aria-live="polite" aria-atomic="true"><div className="progress-track" aria-hidden="true"><span /></div><div className="progress-copy"><strong>{t.cloudWorking}</strong><span className="elapsed-time">{t.elapsed}: {elapsedSeconds}s</span></div><p>{elapsedSeconds < 30 ? t.waiting : t.timeoutHint}</p><p className="eta-copy">{t.expected}</p><p className="deadline-copy">{t.remaining} <strong>{Math.max(0, 120 - elapsedSeconds)}s</strong></p><p className="field-helper">gpt-oss:120b-cloud · Remote cloud via localhost proxy · 120s hard limit</p><button onClick={cancelExtraction}>{t.cancel}</button></div>}
      {state.stage === "confirmation" && state.draft && <div className="chat-turn"><h3>{t.confirm}</h3><p>{t.confirmAll}</p>{extractionRuntime && <p className="model-receipt">{state.language === "en" ? "Organized by cloud model" : "雲端整理模型"}: {extractionRuntime.model}</p>}<div className="fact-list">{state.draft.facts.map((fact) => <div className="fact-editor" key={fact.id}><label htmlFor={fact.id}>{fact.domain.replaceAll("_", " ")}</label><textarea id={fact.id} rows={2} value={edits[fact.id] ?? fact.value} onChange={(event) => setEdits({ ...edits, [fact.id]: event.target.value })} /><label className="confirm-check"><input type="checkbox" checked={Boolean(checked[fact.id])} onChange={(event) => setChecked({ ...checked, [fact.id]: event.target.checked })} /> {state.language === "en" ? "I confirm this fact" : "我確認這項資料正確"}</label></div>)}</div><button className="primary-action" disabled={!allChecked} onClick={finishConfirmation}>{t.finish}</button></div>}
      {state.stage === "ready" && state.confirmedProfile && <div className="chat-turn"><h3>{t.ready}</h3><dl className="confirmed-summary">{state.confirmedProfile.facts.map((fact) => <div key={fact.id}><dt>{fact.domain.replaceAll("_", " ")}</dt><dd>{state.language === "en" ? fact.displayEn : fact.displayZhHant}</dd></div>)}</dl><p className="notice">{state.language === "en" ? "Only this confirmed summary is used for matching. The original text has left the workflow state. Results are not proof of benefit or final eligibility." : "只會使用這份確認摘要配對；原始文字已從流程狀態移除。結果不是療效證明或最終資格。"}</p><label className="confirm-check"><input type="checkbox" checked={webMcpConsent} onChange={(event) => setWebMcpConsent(event.target.checked)} />{state.language === "en" ? "Allow this open page to expose the confirmed summary and current results through WebMCP. Turning this off removes sensitive tools immediately; the original note is never available." : "允許目前開啟的頁面透過 WebMCP 使用確認摘要與目前結果。關閉後敏感工具立即移除；原始病歷永遠不可用。"}</label><div className="action-row"><button className="primary-action" disabled={matching} onClick={runMatching}>{matching ? (state.language === "en" ? "Searching TFDA and ClinicalTrials.gov…" : "正在查詢 TFDA 與 ClinicalTrials.gov…") : (state.language === "en" ? "Find trials to discuss" : "尋找可討論的試驗")}</button><button onClick={() => { setChecked({}); setEdits({}); setMatches([]); setOutreach(undefined); setAnswer(""); setWebMcpConsent(false); dispatch({ type: "RESET" }); }}>{t.clear}</button></div>{matches.length > 0 && <div className="match-list" aria-live="polite"><h3>{state.language === "en" ? "Source-traceable results" : "來源可追溯的結果"}</h3>{matches.slice(0, 12).map((match) => <article className="match-card" key={match.trial.canonicalId}><p className="match-status">{match.status.replaceAll("_", " ")}</p><h4>{match.trial.title}</h4><p>{match.trial.sources.map((source) => `${source.registry}: ${source.registryId}`).join(" · ")}</p><ul>{match.assessments.map((item) => <li key={item.key}><strong>{item.key}: </strong>{state.language === "en" ? item.explanationEn : item.explanationZhHant} <small>Registry field: {item.registryField}; facts: {item.patientFactIds.join(", ") || "none"}</small></li>)}</ul><div className="action-row"><a href={match.trial.sources[0].url} target="_blank" rel="noreferrer">{state.language === "en" ? "Open source registry" : "查看原始登錄"}</a><button onClick={() => setOutreach(createOutreachDraft(state.confirmedProfile!, match.trial, state.language))}>{state.language === "en" ? "Create unsent contact draft" : "建立未寄送聯絡草稿"}</button></div></article>)}<div className="cloud-dialogue"><label className="confirm-check"><input type="checkbox" checked={state.confirmedProfile.cloudUseApproved} onChange={(event) => dispatch({ type: "UPDATE_CONFIRMED_PROFILE", profile: setCloudUseApproval(state.confirmedProfile!, event.target.checked) })} />{state.language === "en" ? "Allow the confirmed, de-identified structured summary to be sent to gpt-oss:120b-cloud through the local Ollama proxy for explanation. You can revoke this at any time." : "允許將確認後、去識別的結構化摘要透過本機 Ollama proxy 交給 gpt-oss:120b-cloud 協助解釋。可隨時取消。"}</label><label htmlFor="cloud-question">{state.language === "en" ? "Ask about these results" : "針對結果繼續提問"}</label><textarea id="cloud-question" rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} /><button disabled={!state.confirmedProfile.cloudUseApproved || question.trim().length < 2} onClick={askCloud}>{state.language === "en" ? "Ask cloud model" : "詢問雲端模型"}</button>{answer && <div className="notice" role="status">{answer}</div>}</div></div>}{outreach && <div className="outreach-draft"><h3>{outreach.subject}</h3><textarea aria-label={state.language === "en" ? "Contact draft" : "聯絡草稿"} rows={12} value={outreach.body} readOnly /><p>{state.language === "en" ? "Status: not sent. TrialBridge TW has no sending tool." : "狀態：尚未寄出。TrialBridge TW 沒有寄送工具。"}</p></div>}</div>}
    </section>
  );
}
