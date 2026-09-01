"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { chatReducer, initialChatState, removeSyntheticDemoSearch, syntheticCompetitionNote, type ChatState } from "@/lib/chat/state";
import { maskDirectIdentifiers } from "@/lib/privacy/mask";
import { confirmProfile, profileDraftSchema, setCloudUseApproval, type ConfirmedProfile } from "@/lib/profile/schema";
import { createOutreachDraft } from "@/lib/matching/outreach";
import { createTrialDiscussionBrief, type TrialDiscussionBrief } from "@/lib/matching/discussionBrief";
import type { TrialMatch } from "@/lib/matching/engine";
import { resolveShortlistedMatches, toggleShortlistTrial } from "@/lib/matching/shortlist";
import { appendConfirmedFollowUpAnswers, derivePreMatchQuestions, type FollowUpQuestion } from "@/lib/matching/followUp";
import { WebMcpBridge } from "./WebMcpBridge";
import { MatchLegend } from "./TrialMatchCard";
import { ClarificationPanel } from "./ClarificationPanel";
import { SummaryConfirmation } from "./SummaryConfirmation";
import { TrialResultGroup } from "./TrialResultGroup";
import { DiscussionBriefPanel } from "./DiscussionBriefPanel";
import { TrialShortlistPanel } from "./TrialShortlistPanel";

type AssistantMessage = { id: string; role: "user" | "assistant"; content: string };

const copy = {
  "zh-Hant": {
    heading: "Agent 引導或手動完成",
    privacy: "您的原文只留在目前頁面。瀏覽器會先遮蔽可辨識資訊；只有在手動按下整理，或於代理模式明確要求整理時，遮蔽內容才會透過 localhost Ollama proxy 傳送至 gpt-oss:120b-cloud。遮蔽不可能百分之百準確。",
    accept: "我了解，繼續", prompt: "請貼上病歷摘要，或用自己的話描述目前狀況",
    helper: "請避免輸入姓名；系統會嘗試遮蔽身分證、電話、Email、病歷號與明確標示的生日或地址。",
    review: "整理病歷並產生確認清單", extract: "重新使用雲端模型整理", back: "返回修改原文",
    cloudNotice: "按下整理後，上方遮蔽內容會交給 gpt-oss:120b-cloud；原始病歷不會傳送。",
    cloudWorking: "gpt-oss:120b-cloud 正在整理內容",
    waiting: "正在透過 localhost Ollama proxy 等待雲端回覆", timeoutHint: "仍在等待；120 秒後會停止，不會無限卡住。",
    expected: "短篇病歷通常約 30–90 秒；較長內容最晚 120 秒停止。", remaining: "距離自動停止最多還有", cancel: "取消並返回", elapsed: "已經過",
    confirm: "逐項確認整理結果", confirmAll: "每一項都要勾選；若不正確，請先修改。",
    finish: "全部確認並建立摘要", clear: "清除此匿名對話",
  },
  en: {
    heading: "Work with an agent or manually",
    privacy: "Your original text stays on this page. The browser masks identifiers first. The masked content is sent through the localhost Ollama proxy to gpt-oss:120b-cloud only when you select organization in Manual mode or explicitly request it in Agent mode. Masking cannot be perfect.",
    accept: "I understand — continue", prompt: "Paste a medical summary or describe the current situation",
    helper: "Avoid names. The browser attempts to mask IDs, phone numbers, email, record numbers, labelled birth dates and addresses.",
    review: "Organize note and create review list", extract: "Retry cloud organization", back: "Edit original text",
    cloudNotice: "Selecting organize sends the masked content above to gpt-oss:120b-cloud. The original note is not sent.",
    cloudWorking: "gpt-oss:120b-cloud is organizing the content",
    waiting: "Waiting for the cloud response through the localhost Ollama proxy", timeoutHint: "Still waiting; the request will stop at 120 seconds instead of hanging indefinitely.",
    expected: "Short notes usually take about 30–90 seconds; longer notes stop at 120 seconds.", remaining: "Automatic stop in no more than", cancel: "Cancel and go back", elapsed: "Elapsed",
    confirm: "Confirm each extracted fact", confirmAll: "Check every fact; edit anything that is not correct first.",
    finish: "Confirm all and create summary", clear: "Clear this anonymous conversation",
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

export function TrialBridgeChat({ initialSyntheticDemo = false }: { initialSyntheticDemo?: boolean }) {
  const initialState = initialSyntheticDemo ? chatReducer(initialChatState, { type: "START_SYNTHETIC_DEMO" }) : initialChatState;
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [intakeMode, setIntakeMode] = useState<"agent" | "manual" | null>(initialSyntheticDemo ? "manual" : null);
  const [matches, setMatches] = useState<TrialMatch[]>([]);
  const [clarificationQuestions, setClarificationQuestions] = useState<FollowUpQuestion[]>([]);
  const [resultView, setResultView] = useState<"cards" | "list">("cards");
  const [shortlistedTrialIds, setShortlistedTrialIds] = useState<string[]>([]);
  const [matching, setMatching] = useState(false);
  const [outreach, setOutreach] = useState<{ subject: string; body: string; sent: false }>();
  const [discussionBrief, setDiscussionBrief] = useState<TrialDiscussionBrief>();
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<AssistantMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [webMcpConsent, setWebMcpConsent] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [extractionRuntime, setExtractionRuntime] = useState<{ model: string; remote: true }>();
  const extractionController = useRef<AbortController | null>(null);
  const t = copy[state.language];
  const allChecked = Boolean(state.draft?.facts.length) && state.draft!.facts.every((fact) => checked[fact.id]);
  const step = useMemo(() => ({ mode: 1, privacy: 1, capture: 1, mask_review: 1, extracting: 1, confirmation: 2, ready: 3 }[state.stage]), [state.stage]);

  useEffect(() => {
    if (state.stage !== "extracting") return;
    setElapsedSeconds(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [state.stage]);

  async function extract(maskResultOverride?: ReturnType<typeof maskDirectIdentifiers>) {
    const maskResult = maskResultOverride ?? state.maskResult;
    if (!maskResult || !state.subjectRole) return;
    extractionController.current?.abort();
    const controller = new AbortController();
    extractionController.current = controller;
    if (maskResultOverride) dispatch({ type: "MASK_COMPLETE", result: maskResultOverride });
    dispatch({ type: "EXTRACTION_START" });
    try {
      const response = await fetch("/api/cloud/extract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maskedText: maskResult.maskedText, subjectRole: state.subjectRole, language: state.language, cloudUseApproved: true }),
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

  function clearAnonymousConversation() {
    extractionController.current?.abort();
    setChecked({});
    setEdits({});
    setMatches([]);
    setShortlistedTrialIds([]);
    setClarificationQuestions([]);
    setClarificationAnswers({});
    setOutreach(undefined);
    setDiscussionBrief(undefined);
    setChatInput("");
    setChatMessages([]);
    setIntakeMode(null);
    setWebMcpConsent(false);
    const nextSearch = removeSyntheticDemoSearch(window.location.search);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${nextSearch}${window.location.hash}`);
    dispatch({ type: "RESET" });
  }

  async function finishConfirmation() {
    if (!state.draft || !allChecked || !state.subjectRole) return;
    const profile = confirmProfile(state.draft, Object.fromEntries(state.draft.facts.map((fact) => [fact.id, {
      value: edits[fact.id] ?? fact.value,
      displayZhHant: state.language === "zh-Hant" ? edits[fact.id] ?? fact.displayZhHant : fact.displayZhHant,
      displayEn: state.language === "en" ? edits[fact.id] ?? fact.displayEn : fact.displayEn,
    }])), state.subjectRole);
    dispatch({ type: "CONFIRM_SUCCESS", profile });
    await loadMatches(profile);
  }

  async function loadMatches(profile: ConfirmedProfile, askBeforeResults = true) {
    setMatching(true);
    setShortlistedTrialIds([]);
    setOutreach(undefined);
    setDiscussionBrief(undefined);
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
    setShortlistedTrialIds([]);
    setClarificationQuestions([]);
    setClarificationAnswers({});
    setOutreach(undefined);
    setDiscussionBrief(undefined);
    setChatInput("");
    setChatMessages([]);
    setIntakeMode(target === "capture" ? "manual" : null);
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

  function appendAssistantMessage(role: AssistantMessage["role"], content: string) {
    setChatMessages((current) => [...current, { id: `${Date.now()}-${current.length}`, role, content }]);
  }

  function toggleShortlist(trialId: string) {
    setShortlistedTrialIds((current) => toggleShortlistTrial(current, trialId));
  }

  async function askCloud(message: string) {
    if (!state.confirmedProfile?.cloudUseApproved || message.trim().length < 2) return;
    const trials = matches.slice(0, 5).map((match) => ({ registryId: match.trial.sources[0].registryId, title: match.trial.title, status: match.status, sourceUrl: match.trial.sources[0].url, shortlisted: shortlistedTrialIds.includes(match.trial.canonicalId) }));
    try {
      const response = await fetch("/api/cloud/dialogue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: state.confirmedProfile, question: message, trials, language: state.language }) });
      const payload = await response.json() as { answer?: string; error?: string };
      appendAssistantMessage("assistant", response.ok && payload.answer ? payload.answer : payload.error ?? "Cloud dialogue failed.");
    } catch { appendAssistantMessage("assistant", state.language === "en" ? "Cloud dialogue failed. Please retry or continue in the middle panel." : "雲端對談失敗，請重試或改用中間工作區繼續。"); }
  }

  async function sendAssistantMessage() {
    const message = chatInput.trim();
    if (message.length < 2 || chatBusy) return;
    appendAssistantMessage("user", message);
    setChatInput("");
    setChatBusy(true);
    try {
      if (state.confirmedProfile && matches.length > 0) {
        if (!state.confirmedProfile.cloudUseApproved) {
          appendAssistantMessage("assistant", state.language === "en" ? "Enable the de-identified summary option below before asking about results." : "詢問結果前，請先開啟下方的去識別摘要使用選項。");
        } else {
          await askCloud(message);
        }
        return;
      }
      const currentQuestion = clarificationQuestions.find((item) => !clarificationAnswers[item.id]);
      const maskedMessage = maskDirectIdentifiers(message).maskedText;
      const response = await fetch("/api/cloud/intake", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: state.stage,
          language: state.language,
          maskedMessage,
          context: {
            confirmedDomains: state.confirmedProfile?.facts.map((fact) => fact.domain) ?? state.draft?.facts.map((fact) => fact.domain) ?? [],
            currentQuestion: currentQuestion ? (state.language === "en" ? currentQuestion.questionEn : currentQuestion.questionZhHant) : undefined,
            hasResults: matches.length > 0,
            allFactsConfirmed: allChecked,
            allFollowUpsAnswered: clarificationQuestions.length > 0 && clarificationQuestions.every((item) => Boolean(clarificationAnswers[item.id])),
          },
        }),
      });
      const payload = await response.json() as { reply?: string; workflowAction?: string; error?: string };
      if (!response.ok || !payload.reply) throw new Error(payload.error ?? "Cloud intake failed.");
      if (state.stage === "privacy" && payload.workflowAction === "accept_privacy") dispatch({ type: "ACCEPT_PRIVACY" });
      if (state.stage === "capture" && payload.workflowAction === "append_medical_note") dispatch({ type: "SET_RAW_TEXT", value: [state.rawText.trim(), message].filter(Boolean).join("\n") });
      if (state.stage === "capture" && payload.workflowAction === "organize_medical_note" && state.rawText.trim().length >= 20) await extract(maskDirectIdentifiers(state.rawText));
      if (state.stage === "confirmation" && payload.workflowAction === "confirm_all_facts" && state.draft) setChecked(Object.fromEntries(state.draft.facts.map((fact) => [fact.id, true])));
      if (state.stage === "confirmation" && payload.workflowAction === "continue_confirmed_summary" && allChecked) await finishConfirmation();
      if (state.stage === "ready" && currentQuestion && payload.workflowAction === "answer_current_question") {
        const unknown = /^(i don'?t know|unknown|not sure|不知道|不確定)$/iu.test(message);
        setClarificationAnswers((current) => ({ ...current, [currentQuestion.id]: unknown ? "__UNKNOWN__" : message }));
      }
      if (state.stage === "ready" && !currentQuestion && clarificationQuestions.length > 0 && payload.workflowAction === "show_results" && clarificationQuestions.every((item) => clarificationAnswers[item.id])) await confirmClarifications(clarificationAnswers);
      appendAssistantMessage("assistant", payload.reply);
    } catch (error) {
      appendAssistantMessage("assistant", error instanceof Error ? error.message : (state.language === "en" ? "The cloud assistant is unavailable. Continue in the middle panel." : "雲端助手目前無法使用，請改用中間工作區繼續。"));
    } finally {
      setChatBusy(false);
    }
  }

  const assistantContext = state.stage === "mode"
    ? (state.language === "en" ? "Choose Agent mode for a chat-led workflow or Manual mode to complete each field yourself." : "請選擇以對談完成的代理模式，或自行填寫的手動模式。")
    : state.stage === "privacy"
      ? (state.language === "en" ? "Review how the note is protected before continuing." : "繼續前，請先閱讀病歷內容如何受到保護。")
      : state.stage === "capture"
        ? (state.language === "en" ? "Describe the diagnosis, stage, biomarkers, treatments, age, and travel preference if known." : "可描述診斷、期別、生物標記、治療、年齡與可旅行地區；不知道的可留白。")
        : state.stage === "mask_review"
          ? (state.language === "en" ? "Check that names and other identifiers are removed before cloud organization." : "送往雲端整理前，請檢查姓名與其他識別資訊是否已遮蔽。")
          : state.stage === "extracting"
            ? (state.language === "en" ? "The cloud model is organizing the masked note. You can cancel at any time." : "雲端模型正在整理遮蔽內容；您可隨時取消。")
            : state.stage === "confirmation"
              ? (state.language === "en" ? "Compare each extracted field with the masked note. Editing a field clears its check." : "請逐欄對照遮蔽內容；修改欄位後，該欄會自動取消勾選。")
              : matching
                ? (state.language === "en" ? "I am checking public trial requirements and will ask only for information that can change the comparison." : "正在檢查公開試驗條件，只會補問可能改變比較結果的資訊。")
                : clarificationQuestions.length > 0
                  ? (state.language === "en" ? "Answer the questions in the middle panel. Choosing I don't know is a complete answer." : "請回答中間的補充問題；選擇「我不知道」也算完成回答。")
                  : matches.length > 0
                    ? (state.language === "en" ? "The comparison is ready. You can ask me to explain a result in plain language." : "比較結果已完成；您可在這裡詢問任何結果的白話解釋。")
                    : (state.language === "en" ? "I will stay here while you move through the matching steps." : "我會在這裡陪您完成每個配對步驟。");

  return (
    <section className="chat-shell" id="private-chat" aria-labelledby="chat-title">
      <div className="chat-heading"><div><p className="eyebrow">Agentic TrialBridge</p><h2 id="chat-title">{t.heading}</h2></div><div className="header-controls">{intakeMode && <div className="mode-toggle" role="group" aria-label={state.language === "en" ? "Workflow mode" : "工作模式"}><button aria-pressed={intakeMode === "agent"} onClick={() => setIntakeMode("agent")}>{state.language === "en" ? "Agent mode" : "代理模式"}</button><button aria-pressed={intakeMode === "manual"} onClick={() => setIntakeMode("manual")}>{state.language === "en" ? "Manual mode" : "手動模式"}</button></div>}<span>Step {step}/3</span></div></div>
      {process.env.NODE_ENV === "development" && <div className="dev-stage-switcher" role="group" aria-label="Development stage shortcuts"><strong>Development shortcuts</strong><span>Synthetic data only</span><div>{(["start", "capture", "mask", "confirmation", "results"] as const).map((target) => <button key={target} onClick={() => void jumpToDevelopmentStage(target)}>{target === "start" ? "Start" : target === "capture" ? "Enter note" : target === "mask" ? "Mask review" : target === "confirmation" ? "Confirm summary" : "Trial cards"}</button>)}</div></div>}
      <WebMcpBridge profile={state.confirmedProfile} matches={matches} shortlistedTrialIds={shortlistedTrialIds} pendingQuestions={clarificationQuestions} matching={matching} sensitiveConsent={webMcpConsent} language={state.language} />
      <div className="chat-workspace">
      <aside className="flow-rail" aria-label={state.language === "en" ? "Matching progress" : "配對進度"}><ol>{[
        { number: 1, en: "Enter note", zh: "建立病況" },
        { number: 2, en: "Confirm facts", zh: "確認資料" },
        { number: 3, en: "Compare trials", zh: "比較試驗" },
      ].map((item) => <li key={item.number} className={step === item.number ? "current" : step > item.number ? "complete" : ""} aria-current={step === item.number ? "step" : undefined}><span>{step > item.number ? "✓" : item.number}</span><strong>{state.language === "en" ? item.en : item.zh}</strong></li>)}</ol></aside>
      <div className="workflow-pane">
      {state.stage === "mode" && <div className="chat-turn mode-onboarding"><div className="language-switch" aria-label="Language"><button className={state.language === "en" ? "selected" : ""} onClick={() => dispatch({ type: "SET_LANGUAGE", language: "en" })}>English</button><button className={state.language === "zh-Hant" ? "selected" : ""} onClick={() => dispatch({ type: "SET_LANGUAGE", language: "zh-Hant" })}>繁中</button></div><p className="eyebrow">{state.language === "en" ? "Choose how to work" : "選擇使用方式"}</p><h3>{state.language === "en" ? "Start with an agent or complete the steps yourself" : "由 Agent 引導，或自行完成每個步驟"}</h3><div className="mode-choice-grid"><button onClick={() => { setIntakeMode("agent"); dispatch({ type: "START_INTAKE" }); }}><strong>{state.language === "en" ? "Agent mode" : "代理模式"}</strong><small>{state.language === "en" ? "Chat is the main interface. The agent fills the shared note and guides every step." : "以對談為主要介面；Agent 填入共用病況並引導全部步驟。"}</small></button><button onClick={() => { setIntakeMode("manual"); dispatch({ type: "START_INTAKE" }); }}><strong>{state.language === "en" ? "Manual mode" : "手動模式"}</strong><small>{state.language === "en" ? "Enter the note, run extraction, review facts, and continue." : "自行輸入病歷、執行整理、核對 facts 後繼續。"}</small></button></div><div className="synthetic-demo-entry"><button type="button" onClick={() => { setIntakeMode("manual"); dispatch({ type: "START_SYNTHETIC_DEMO" }); }}>{state.language === "en" ? "Try a synthetic case" : "試用虛構案例"}</button><small>{state.language === "en" ? "Fictional data · real masking, cloud extraction, confirmation, questions, and matching" : "虛構資料 · 真實執行遮蔽、雲端整理、確認、補問與配對"}</small></div></div>}
      {(state.stage === "privacy" || state.stage === "capture") && state.rawText === syntheticCompetitionNote && <div className="synthetic-demo-banner" role="status" aria-live="polite"><strong>{state.language === "en" ? "Synthetic competition case ready" : "競賽虛構案例已準備"}</strong><span>{state.language === "en" ? "No real patient data. Privacy, masking, cloud organization, confirmation, and questions still run in order." : "不含真實病人資料；隱私、遮蔽、雲端整理、確認與補問仍會依序執行。"}</span></div>}
      {state.stage === "privacy" && <div className="chat-turn"><p>{t.privacy}</p><button className="primary-action" onClick={() => dispatch({ type: "ACCEPT_PRIVACY" })}>{t.accept}</button></div>}
      {state.stage === "capture" && <div className="chat-turn intake-entry">{intakeMode === "agent" ? <div className="chat-intake-summary"><div className="intake-entry-heading"><div><p className="eyebrow">{state.language === "en" ? "Agent mode · Chat is everything" : "代理模式 · 以對談完成全部流程"}</p><h3>{state.language === "en" ? "Build the note through the assistant" : "透過助手建立病況內容"}</h3></div><span>{state.rawText.trim().length} {state.language === "en" ? "characters collected" : "字已蒐集"}</span></div><div className="agent-note-preview" aria-live="polite">{state.rawText.trim() || (state.language === "en" ? "Start in the chat panel. Medical answers will appear here as one shared note." : "請從右側對談開始；醫療相關回答會整理成同一份病況內容。")}</div><p className="field-helper">{state.language === "en" ? "Tell the assistant when the note is complete. It can start masking and extraction for you." : "內容完整後請告訴助手；它可以為您啟動遮蔽與雲端整理。"}</p></div> : <div className="note-intake"><div className="intake-entry-heading"><div><p className="eyebrow">{state.language === "en" ? "Manual mode" : "手動模式"}</p><h3>{state.language === "en" ? "Enter the note, then extract" : "輸入病歷後執行整理"}</h3></div><span>{state.language === "en" ? "You control each step" : "自行控制每一步"}</span></div><label htmlFor="medical-note">{t.prompt}</label><textarea id="medical-note" value={state.rawText} onChange={(event) => dispatch({ type: "SET_RAW_TEXT", value: event.target.value })} aria-describedby="note-helper" rows={9} /><p id="note-helper" className="field-helper">{t.helper}</p><button className="primary-action" disabled={state.rawText.trim().length < 20} onClick={() => void extract(maskDirectIdentifiers(state.rawText))}>{t.review}</button></div>}</div>}
      {state.stage === "mask_review" && state.maskResult && <div className="chat-turn"><h3>{state.language === "en" ? "Cloud organization needs attention" : "雲端整理需要處理"}</h3><pre className="masked-preview">{state.maskResult.maskedText}</pre><p className="field-helper">{state.language === "en" ? "Masked items" : "已遮蔽項目"}: {state.maskResult.findings.length}.</p><div className="cloud-transfer-note"><strong>{state.language === "en" ? "Cloud organization" : "雲端整理"}</strong><p>{t.cloudNotice}</p></div>{state.error && <div className="error-panel" role="alert"><strong>{state.language === "en" ? "Cloud extraction stopped" : "雲端整理已停止"}</strong><p>{state.error}</p></div>}<div className="action-row"><button onClick={() => dispatch({ type: "BACK_TO_CAPTURE" })}>{t.back}</button><button className="primary-action" onClick={() => void extract()}>{t.extract}</button></div></div>}
      {state.stage === "extracting" && <div className="chat-turn extraction-progress" role="status" aria-live="polite" aria-atomic="true"><div className="progress-track" aria-hidden="true"><span /></div><div className="progress-copy"><strong>{t.cloudWorking}</strong><span className="elapsed-time">{t.elapsed}: {elapsedSeconds}s</span></div><p>{elapsedSeconds < 30 ? t.waiting : t.timeoutHint}</p><p className="eta-copy">{t.expected}</p><p className="deadline-copy">{t.remaining} <strong>{Math.max(0, 120 - elapsedSeconds)}s</strong></p><p className="field-helper">gpt-oss:120b-cloud · Remote cloud via localhost proxy · 120s hard limit</p><button onClick={cancelExtraction}>{t.cancel}</button></div>}
      {(state.stage === "confirmation" || state.stage === "ready") && state.draft && state.maskResult && <SummaryConfirmation completed={state.stage === "ready"} draft={state.draft} maskResult={state.maskResult} language={state.language} model={extractionRuntime?.model} edits={edits} checked={checked} onEdit={(id, value) => { setEdits((current) => ({ ...current, [id]: value })); setChecked((current) => ({ ...current, [id]: false })); }} onCheck={(id, value) => setChecked((current) => ({ ...current, [id]: value }))} onCheckAll={() => setChecked(Object.fromEntries(state.draft!.facts.map((fact) => [fact.id, true])))} onBack={() => dispatch({ type: "BACK_TO_CAPTURE" })} onFinish={() => void finishConfirmation()} />}
      {state.stage === "ready" && state.confirmedProfile && <div className="chat-turn ready-stage">
        <div className="post-confirmation-controls"><label className="confirm-check webmcp-consent"><input type="checkbox" checked={webMcpConsent} onChange={(event) => setWebMcpConsent(event.target.checked)} />{state.language === "en" ? "Allow WebMCP to use the confirmed summary and current results." : "允許 WebMCP 使用確認摘要與目前結果。"}</label><button onClick={clearAnonymousConversation}>{t.clear}</button></div>
        {matching && <div className="matching-progress" role="status">{state.language === "en" ? "Checking public trial requirements…" : "正在檢查公開試驗條件…"}</div>}
        {clarificationQuestions.length > 0 && <ClarificationPanel questions={clarificationQuestions} language={state.language} answers={clarificationAnswers} onAnswersChange={setClarificationAnswers} onConfirm={confirmClarifications} />}
        {matches.length > 0 && <div className="visual-results" aria-live="polite">
          <div className="results-title-row"><div><p className="eyebrow">Visual comparison</p><h3>{state.language === "en" ? "Source-traceable trial results" : "來源可追溯的試驗結果"}</h3></div><div className="results-controls"><MatchLegend language={state.language} /><div className="view-switcher" role="group" aria-label={state.language === "en" ? "Result view" : "結果顯示方式"}><button aria-pressed={resultView === "cards"} onClick={() => setResultView("cards")}>{state.language === "en" ? "Cards" : "卡片"}</button><button aria-pressed={resultView === "list"} onClick={() => setResultView("list")}>{state.language === "en" ? "List" : "條列"}</button></div></div></div>
          <div className="results-export-row"><div><strong>{state.language === "en" ? "Take the comparison to your care team" : "將比較結果帶給照護團隊"}</strong><p>{state.language === "en" ? "Create a local brief in the current language from confirmed facts and up to five source-linked trials." : "使用已確認資料與最多五項可追溯試驗，以目前語言建立本機討論摘要。"}</p></div><button type="button" onClick={() => setDiscussionBrief(createTrialDiscussionBrief(state.confirmedProfile!, matches, state.language))}>{state.language === "en" ? "Create discussion brief" : "建立討論摘要"}</button></div>
          <TrialShortlistPanel matches={resolveShortlistedMatches(matches, shortlistedTrialIds)} language={state.language} onRemove={toggleShortlist} onClear={() => setShortlistedTrialIds([])} />
          <div className="result-groups">
              <TrialResultGroup title={state.language === "en" ? "No known public-record difference" : "目前無已知公開條件差異"} description={state.language === "en" ? "Shown first. Yellow items still require criterion-by-criterion review; this is not a final eligibility decision." : "優先顯示；黃色項目仍需逐條確認，且不是最終資格判定。"} emptyText={state.language === "en" ? "No trial is currently in this group." : "目前沒有試驗在此群組。"} matches={matches.slice(0, 12).filter((match) => match.status === "discuss" || match.status === "needs_review")} profile={state.confirmedProfile} language={state.language} view={resultView} shortlistedTrialIds={shortlistedTrialIds} onToggleShortlist={toggleShortlist} onCreateOutreach={(match) => setOutreach(createOutreachDraft(state.confirmedProfile!, match.trial, state.language))} />
              <TrialResultGroup title={state.language === "en" ? "More information needed" : "仍需更多資訊"} description={state.language === "en" ? "You were asked about the most common missing fields before these results were shown." : "顯示結果前已先詢問常見缺漏欄位。"} emptyText={state.language === "en" ? "No trial remains in this group." : "目前沒有試驗留在此群組。"} matches={matches.slice(0, 12).filter((match) => match.status === "needs_information")} profile={state.confirmedProfile} language={state.language} view={resultView} shortlistedTrialIds={shortlistedTrialIds} onToggleShortlist={toggleShortlist} onCreateOutreach={(match) => setOutreach(createOutreachDraft(state.confirmedProfile!, match.trial, state.language))} />
              <TrialResultGroup collapsed title={state.language === "en" ? "Public-record differences found" : "發現公開條件差異"} description={state.language === "en" ? "Collapsed by default. Includes potential exclusion signals; only the study team can decide eligibility." : "預設收合。包含可能排除訊號；只有試驗團隊能判定最終資格。"} emptyText={state.language === "en" ? "No public-record mismatch was found." : "未發現公開資料差異。"} matches={matches.slice(0, 12).filter((match) => match.status === "unlikely_based_on_public_record")} profile={state.confirmedProfile} language={state.language} view={resultView} shortlistedTrialIds={shortlistedTrialIds} onToggleShortlist={toggleShortlist} onCreateOutreach={(match) => setOutreach(createOutreachDraft(state.confirmedProfile!, match.trial, state.language))} />
          </div>
        </div>}
        {discussionBrief && <DiscussionBriefPanel brief={discussionBrief} language={state.language} onClose={() => setDiscussionBrief(undefined)} />}
        {outreach && <div className="outreach-draft"><h3>{outreach.subject}</h3><textarea aria-label={state.language === "en" ? "Contact draft" : "聯絡草稿"} rows={12} value={outreach.body} readOnly /><p>{state.language === "en" ? "Status: not sent. TrialBridge TW has no sending tool." : "狀態：尚未寄出。TrialBridge TW 沒有寄送工具。"}</p></div>}
      </div>}
      </div>
      <aside className="persistent-chat-panel" aria-labelledby="assistant-title">
        <div className="assistant-heading"><div><p className="eyebrow">gpt-oss:120b-cloud</p><h3 id="assistant-title">{state.language === "en" ? "TrialBridge assistant" : "TrialBridge 對談助手"}</h3></div><span>{state.language === "en" ? "Always here" : "全程顯示"}</span></div>
        <div className="assistant-thread" aria-live="polite"><div className="assistant-message"><strong>TrialBridge TW</strong><p>{assistantContext}</p></div>{chatMessages.map((message) => <div key={message.id} className={`assistant-message ${message.role === "user" ? "user-message" : "answer-message"}`}><strong>{message.role === "user" ? (state.language === "en" ? "You" : "您") : "TrialBridge TW"}</strong><p>{message.content}</p></div>)}{chatBusy && <div className="assistant-message assistant-thinking" role="status"><strong>gpt-oss:120b-cloud</strong><p>{state.language === "en" ? "Thinking… You can still review the middle panel." : "正在思考…您仍可檢查中間工作區。"}</p></div>}</div>
        {intakeMode === "agent" ? <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); void sendAssistantMessage(); }}>
          {state.confirmedProfile && matches.length > 0 && <label className="confirm-check"><input type="checkbox" checked={state.confirmedProfile.cloudUseApproved} onChange={(event) => dispatch({ type: "UPDATE_CONFIRMED_PROFILE", profile: setCloudUseApproval(state.confirmedProfile!, event.target.checked) })} />{state.language === "en" ? "Allow the confirmed de-identified summary to be used for result questions." : "允許結果問答使用確認後的去識別摘要。"}</label>}
          <label htmlFor="assistant-message-input">{state.confirmedProfile && matches.length > 0 ? (state.language === "en" ? "Ask about the results" : "詢問結果") : (state.language === "en" ? "Talk to TrialBridge" : "與 TrialBridge 對談")}</label>
          <textarea id="assistant-message-input" rows={3} value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder={state.stage === "capture" ? (state.language === "en" ? "My diagnosis is…" : "我的診斷是…") : (state.language === "en" ? "Type a reply or ask a question" : "輸入回答或提出問題")} />
          <button className="primary-action" type="submit" disabled={chatBusy || chatInput.trim().length < 2}>{chatBusy ? (state.language === "en" ? "Waiting for cloud…" : "等待雲端回覆…") : (state.language === "en" ? "Send" : "送出")}</button>
          <small>{state.language === "en" ? "Messages are masked in the browser before guided cloud chat. Medical facts still require confirmation in the middle panel." : "引導對談訊息會先在瀏覽器遮蔽再送往雲端；醫療資料仍須在中間工作區確認。"}</small>
        </form> : <div className="assistant-composer manual-assistant-state"><strong>{intakeMode === "manual" ? (state.language === "en" ? "Manual mode" : "手動模式") : (state.language === "en" ? "Choose a mode to begin" : "請先選擇模式")}</strong><p>{intakeMode === "manual" ? (state.language === "en" ? "Use the middle panel to enter, extract, and confirm. Switch to Agent mode above whenever you want guided chat." : "請在中間工作區輸入、整理並確認；需要對談引導時，可隨時在上方切換為代理模式。") : (state.language === "en" ? "Agent mode enables guided chat. Manual mode keeps every step in the middle panel." : "代理模式會開啟引導對談；手動模式則在中間工作區逐步完成。")}</p></div>}
      </aside>
      </div>
    </section>
  );
}
