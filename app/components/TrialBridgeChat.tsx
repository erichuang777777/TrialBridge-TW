"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { chatReducer, initialChatState, type ChatState } from "@/lib/chat/state";
import { maskDirectIdentifiers } from "@/lib/privacy/mask";
import { confirmProfile, profileDraftSchema, setCloudUseApproval, type ConfirmedProfile } from "@/lib/profile/schema";
import { createOutreachDraft } from "@/lib/matching/outreach";
import type { TrialMatch } from "@/lib/matching/engine";
import { appendConfirmedFollowUpAnswers, derivePreMatchQuestions, type FollowUpQuestion } from "@/lib/matching/followUp";
import { WebMcpBridge } from "./WebMcpBridge";
import { MatchLegend } from "./TrialMatchCard";
import { ClarificationPanel } from "./ClarificationPanel";
import { SummaryConfirmation } from "./SummaryConfirmation";
import { TrialResultGroup } from "./TrialResultGroup";

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

const syntheticDevDraft = profileDraftSchema.parse({
  schemaVersion: "1.0",
  language: "en",
  subjectRole: "patient",
  facts: [
    { id: "fact_dev_cancer", domain: "cancer_type", value: "gastric cancer", displayZhHant: "胃癌", displayEn: "Gastric cancer", source: "masked_note", confidence: 0.96, confirmed: false },
    { id: "fact_dev_stage", domain: "stage", value: "stage IV", displayZhHant: "第四期", displayEn: "Stage IV", source: "masked_note", confidence: 0.92, confirmed: false },
    { id: "fact_dev_biomarker", domain: "biomarker", value: "HER2 negative", displayZhHant: "HER2 陰性", displayEn: "HER2 negative", source: "masked_note", confidence: 0.9, confirmed: false },
    { id: "fact_dev_age", domain: "age_band", value: "62 years", displayZhHant: "62 歲", displayEn: "62 years", source: "masked_note", confidence: 0.98, confirmed: false },
    { id: "fact_dev_sex", domain: "sex_eligibility", value: "all", displayZhHant: "不限性別", displayEn: "All sexes", source: "masked_note", confidence: 0.8, confirmed: false },
    { id: "fact_dev_travel", domain: "travel_preference", value: "Taiwan and Asia", displayZhHant: "台灣與亞洲", displayEn: "Taiwan and Asia", source: "user_statement", confidence: 1, confirmed: false },
  ],
  missingQuestions: [],
  safetyNote: "Synthetic development fixture. Not medical advice or an eligibility decision.",
});

export function TrialBridgeChat() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [matches, setMatches] = useState<TrialMatch[]>([]);
  const [clarificationQuestions, setClarificationQuestions] = useState<FollowUpQuestion[]>([]);
  const [resultView, setResultView] = useState<"cards" | "list">("cards");
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

  async function loadMatches(profile: ConfirmedProfile, askBeforeResults = true) {
    setMatching(true);
    setOutreach(undefined);
    setClarificationQuestions([]);
    try {
      const response = await fetch("/api/matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }) });
      const payload = await response.json() as { matches?: TrialMatch[]; error?: string };
      if (!response.ok || !payload.matches) throw new Error(payload.error ?? "Matching failed.");
      const questions = askBeforeResults ? derivePreMatchQuestions(profile, payload.matches.slice(0, 12).map((match) => match.trial)) : [];
      if (questions.length > 0) {
        setMatches([]);
        setClarificationQuestions(questions);
      } else {
        setMatches(payload.matches);
      }
    } catch (error) {
      setMatches([]);
      setOutreach({ subject: "Error", body: error instanceof Error ? error.message : "Matching failed.", sent: false });
    } finally { setMatching(false); }
  }

  async function runMatching() {
    if (state.confirmedProfile) await loadMatches(state.confirmedProfile);
  }

  async function confirmClarifications(answers: Record<string, string>) {
    if (!state.confirmedProfile || clarificationQuestions.length === 0) return;
    const updatedProfile = appendConfirmedFollowUpAnswers(state.confirmedProfile, clarificationQuestions, answers);
    dispatch({ type: "UPDATE_CONFIRMED_PROFILE", profile: updatedProfile });
    setClarificationQuestions([]);
    await loadMatches(updatedProfile, false);
  }

  async function jumpToDevelopmentStage(target: "start" | "capture" | "mask" | "confirmation" | "results") {
    if (process.env.NODE_ENV !== "development") return;
    extractionController.current?.abort();
    setMatches([]);
    setClarificationQuestions([]);
    setOutreach(undefined);
    setAnswer("");
    setChecked({});
    setWebMcpConsent(false);
    const base: ChatState = { stage: "capture", language: state.language, subjectRole: "patient", rawText: "Synthetic development note: stage IV gastric cancer, HER2 negative, age 62, prior FOLFOX." };
    if (target === "start") return dispatch({ type: "RESET" });
    if (target === "capture") return dispatch({ type: "DEV_SET_STATE", state: base });
    if (target === "mask") return dispatch({ type: "DEV_SET_STATE", state: { ...base, stage: "mask_review", rawText: "", maskResult: { maskedText: "Synthetic development note: stage IV gastric cancer, HER2 negative, age 62, prior FOLFOX.", findings: [] } } });
    setEdits(Object.fromEntries(syntheticDevDraft.facts.map((fact) => [fact.id, fact.value])));
    if (target === "confirmation") return dispatch({ type: "DEV_SET_STATE", state: { ...base, stage: "confirmation", rawText: "", maskResult: { maskedText: base.rawText, findings: [] }, draft: syntheticDevDraft } });
    const profile = confirmProfile(syntheticDevDraft, {}, "patient");
    dispatch({ type: "DEV_SET_STATE", state: { stage: "ready", language: state.language, subjectRole: "patient", rawText: "", confirmedProfile: profile } });
    await loadMatches(profile, false);
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
      {process.env.NODE_ENV === "development" && <div className="dev-stage-switcher" role="group" aria-label="Development stage shortcuts"><strong>Development shortcuts</strong><span>Synthetic data only</span><div>{(["start", "capture", "mask", "confirmation", "results"] as const).map((target) => <button key={target} onClick={() => void jumpToDevelopmentStage(target)}>{target === "start" ? "Start" : target === "capture" ? "Enter note" : target === "mask" ? "Mask review" : target === "confirmation" ? "Confirm summary" : "Trial cards"}</button>)}</div></div>}
      {state.stage === "role" && <div className="chat-turn"><div className="language-switch" aria-label="Language"><button className={state.language === "en" ? "selected" : ""} onClick={() => dispatch({ type: "SET_LANGUAGE", language: "en" })}>English</button><button className={state.language === "zh-Hant" ? "selected" : ""} onClick={() => dispatch({ type: "SET_LANGUAGE", language: "zh-Hant" })}>繁中</button></div><div className="choice-grid"><button onClick={() => dispatch({ type: "SELECT_ROLE", role: "patient" })}>{t.patient}</button><button onClick={() => dispatch({ type: "SELECT_ROLE", role: "caregiver" })}>{t.caregiver}</button></div></div>}
      {state.stage === "privacy" && <div className="chat-turn"><p>{t.privacy}</p>{state.subjectRole === "caregiver" && <p className="notice">{state.language === "en" ? "Share only information you are authorized to provide and can verify. Choose unknown when unsure." : "請只提供您獲得授權且能確認的資訊；不確定時請選擇未知。"}</p>}<button className="primary-action" onClick={() => dispatch({ type: "ACCEPT_PRIVACY" })}>{t.accept}</button></div>}
      {state.stage === "capture" && <div className="chat-turn"><label htmlFor="medical-note">{t.prompt}</label><textarea id="medical-note" value={state.rawText} onChange={(event) => dispatch({ type: "SET_RAW_TEXT", value: event.target.value })} aria-describedby="note-helper" rows={9} /><p id="note-helper" className="field-helper">{t.helper}</p><button className="primary-action" disabled={state.rawText.trim().length < 20} onClick={() => { setCloudExtractionConsent(false); dispatch({ type: "MASK_COMPLETE", result: maskDirectIdentifiers(state.rawText) }); }}>{t.review}</button></div>}
      {state.stage === "mask_review" && state.maskResult && <div className="chat-turn"><h3>{t.review}</h3><pre className="masked-preview">{state.maskResult.maskedText}</pre><p className="field-helper">{state.language === "en" ? "Masked items" : "已遮蔽項目"}: {state.maskResult.findings.length}.</p><div className="cloud-consent"><strong>{state.language === "en" ? "Cloud transfer" : "雲端傳輸"}</strong><label className="confirm-check"><input type="checkbox" checked={cloudExtractionConsent} onChange={(event) => setCloudExtractionConsent(event.target.checked)} />{t.cloudConsent}</label></div>{state.error && <div className="error-panel" role="alert"><strong>{state.language === "en" ? "Cloud extraction stopped" : "雲端整理已停止"}</strong><p>{state.error}</p></div>}<div className="action-row"><button onClick={() => { setCloudExtractionConsent(false); dispatch({ type: "BACK_TO_CAPTURE" }); }}>{t.back}</button><button className="primary-action" disabled={!cloudExtractionConsent} onClick={extract}>{t.extract}</button></div></div>}
      {state.stage === "extracting" && <div className="chat-turn extraction-progress" role="status" aria-live="polite" aria-atomic="true"><div className="progress-track" aria-hidden="true"><span /></div><div className="progress-copy"><strong>{t.cloudWorking}</strong><span className="elapsed-time">{t.elapsed}: {elapsedSeconds}s</span></div><p>{elapsedSeconds < 30 ? t.waiting : t.timeoutHint}</p><p className="eta-copy">{t.expected}</p><p className="deadline-copy">{t.remaining} <strong>{Math.max(0, 120 - elapsedSeconds)}s</strong></p><p className="field-helper">gpt-oss:120b-cloud · Remote cloud via localhost proxy · 120s hard limit</p><button onClick={cancelExtraction}>{t.cancel}</button></div>}
      {state.stage === "confirmation" && state.draft && state.maskResult && <SummaryConfirmation draft={state.draft} maskResult={state.maskResult} language={state.language} model={extractionRuntime?.model} edits={edits} checked={checked} onEdit={(id, value) => { setEdits((current) => ({ ...current, [id]: value })); setChecked((current) => ({ ...current, [id]: false })); }} onCheck={(id, value) => setChecked((current) => ({ ...current, [id]: value }))} onCheckAll={() => setChecked(Object.fromEntries(state.draft!.facts.map((fact) => [fact.id, true])))} onBack={() => dispatch({ type: "BACK_TO_CAPTURE" })} onFinish={finishConfirmation} />}
      {state.stage === "ready" && state.confirmedProfile && <div className="chat-turn ready-stage">
        <div className="ready-summary-row"><div><h3>{t.ready}</h3><p>{state.language === "en" ? `${state.confirmedProfile.facts.length} confirmed facts used for matching.` : `使用 ${state.confirmedProfile.facts.length} 項已確認資料進行配對。`}</p></div><details><summary>{state.language === "en" ? "View summary" : "查看摘要"}</summary><dl className="confirmed-summary">{state.confirmedProfile.facts.map((fact) => <div key={fact.id}><dt>{fact.domain.replaceAll("_", " ")}</dt><dd>{state.language === "en" ? fact.displayEn : fact.displayZhHant}</dd></div>)}</dl></details></div>
        <label className="confirm-check webmcp-consent"><input type="checkbox" checked={webMcpConsent} onChange={(event) => setWebMcpConsent(event.target.checked)} />{state.language === "en" ? "Allow this page to expose the confirmed summary and current results through WebMCP." : "允許此頁透過 WebMCP 使用確認摘要與目前結果。"}</label>
        <div className="action-row"><button className="primary-action" disabled={matching || clarificationQuestions.length > 0} onClick={runMatching}>{matching ? (state.language === "en" ? "Checking trial requirements…" : "正在檢查試驗條件…") : (state.language === "en" ? "Find trials to discuss" : "尋找可討論的試驗")}</button><button onClick={() => { setChecked({}); setEdits({}); setMatches([]); setClarificationQuestions([]); setOutreach(undefined); setAnswer(""); setWebMcpConsent(false); dispatch({ type: "RESET" }); }}>{t.clear}</button></div>
        {clarificationQuestions.length > 0 && <ClarificationPanel questions={clarificationQuestions} language={state.language} onConfirm={confirmClarifications} />}
        {matches.length > 0 && <div className="visual-results" aria-live="polite">
          <div className="results-title-row"><div><p className="eyebrow">Visual comparison</p><h3>{state.language === "en" ? "Source-traceable trial results" : "來源可追溯的試驗結果"}</h3></div><div className="results-controls"><MatchLegend language={state.language} /><div className="view-switcher" role="group" aria-label={state.language === "en" ? "Result view" : "結果顯示方式"}><button aria-pressed={resultView === "cards"} onClick={() => setResultView("cards")}>{state.language === "en" ? "Cards" : "卡片"}</button><button aria-pressed={resultView === "list"} onClick={() => setResultView("list")}>{state.language === "en" ? "List" : "條列"}</button></div></div></div>
          <div className="results-and-chat">
            <div className="result-groups">
              <TrialResultGroup title={state.language === "en" ? "No known public-record difference" : "目前無已知公開條件差異"} description={state.language === "en" ? "Shown first. Yellow items still require criterion-by-criterion review; this is not a final eligibility decision." : "優先顯示；黃色項目仍需逐條確認，且不是最終資格判定。"} emptyText={state.language === "en" ? "No trial is currently in this group." : "目前沒有試驗在此群組。"} matches={matches.slice(0, 12).filter((match) => match.status === "discuss" || match.status === "needs_review")} language={state.language} view={resultView} onCreateOutreach={(match) => setOutreach(createOutreachDraft(state.confirmedProfile!, match.trial, state.language))} />
              <TrialResultGroup title={state.language === "en" ? "More information needed" : "仍需更多資訊"} description={state.language === "en" ? "You were asked about the most common missing fields before these results were shown." : "顯示結果前已先詢問常見缺漏欄位。"} emptyText={state.language === "en" ? "No trial remains in this group." : "目前沒有試驗留在此群組。"} matches={matches.slice(0, 12).filter((match) => match.status === "needs_information")} language={state.language} view={resultView} onCreateOutreach={(match) => setOutreach(createOutreachDraft(state.confirmedProfile!, match.trial, state.language))} />
              <TrialResultGroup collapsed title={state.language === "en" ? "Public-record differences found" : "發現公開條件差異"} description={state.language === "en" ? "Collapsed by default. Includes potential exclusion signals; only the study team can decide eligibility." : "預設收合。包含可能排除訊號；只有試驗團隊能判定最終資格。"} emptyText={state.language === "en" ? "No public-record mismatch was found." : "未發現公開資料差異。"} matches={matches.slice(0, 12).filter((match) => match.status === "unlikely_based_on_public_record")} language={state.language} view={resultView} onCreateOutreach={(match) => setOutreach(createOutreachDraft(state.confirmedProfile!, match.trial, state.language))} />
            </div>
            <aside className="cloud-dialogue result-chat-panel" aria-labelledby="result-chat-title"><p className="eyebrow">gpt-oss:120b-cloud</p><h3 id="result-chat-title">{state.language === "en" ? "Chat about the results" : "針對結果對談"}</h3><p>{state.language === "en" ? "Ask for plain-language explanations or questions to discuss with the study team." : "可詢問白話解釋，或整理要向試驗團隊確認的問題。"}</p><label className="confirm-check"><input type="checkbox" checked={state.confirmedProfile.cloudUseApproved} onChange={(event) => dispatch({ type: "UPDATE_CONFIRMED_PROFILE", profile: setCloudUseApproval(state.confirmedProfile!, event.target.checked) })} />{state.language === "en" ? "Allow the confirmed, de-identified summary to be sent to the cloud model." : "允許將確認後、去識別的摘要交給雲端模型。"}</label><label htmlFor="cloud-question">{state.language === "en" ? "Your question" : "您的問題"}</label><textarea id="cloud-question" rows={5} value={question} onChange={(event) => setQuestion(event.target.value)} /><button disabled={!state.confirmedProfile.cloudUseApproved || question.trim().length < 2} onClick={askCloud}>{state.language === "en" ? "Ask about results" : "詢問結果"}</button>{answer && <div className="notice" role="status">{answer}</div>}</aside>
          </div>
        </div>}
        {outreach && <div className="outreach-draft"><h3>{outreach.subject}</h3><textarea aria-label={state.language === "en" ? "Contact draft" : "聯絡草稿"} rows={12} value={outreach.body} readOnly /><p>{state.language === "en" ? "Status: not sent. TrialBridge TW has no sending tool." : "狀態：尚未寄出。TrialBridge TW 沒有寄送工具。"}</p></div>}
      </div>}
    </section>
  );
}
