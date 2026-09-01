"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildTrialBridgeTools } from "@/lib/webmcp/tools";
import type { WebMcpActivity } from "@/lib/webmcp/tools";
import { appendCapabilitySet, appendRuntimeState, appendToolExecution, createWebMcpSessionReceipt } from "@/lib/webmcp/receipt";
import type { WebMcpReceiptEvent } from "@/lib/webmcp/receipt";
import type { TrialMatch } from "@/lib/matching/engine";
import type { FollowUpQuestion } from "@/lib/matching/followUp";
import type { ConfirmedProfile } from "@/lib/profile/schema";

type RegistrationState = "checking" | "unsupported" | "registering" | "ready" | "error";
type Language = "zh-Hant" | "en";

const publicToolNames = ["trialbridge_method", "search_public_cancer_trials"];
const contextualToolNames = ["review_trial_followups", "explain_confirmed_matches", "draft_trial_outreach", "draft_trial_discussion_brief", "compare_shortlisted_trials"];

const judgePrompts = {
  en: [
    "Explain TrialBridge TW's Taiwan-first method and privacy boundary.",
    "Search public recruiting cancer trials for gastric cancer.",
    "Which trial requirements still need my answer before results can be compared?",
    "Draft a care-team discussion brief from my confirmed results.",
    "Compare the trials I added to my shortlist.",
  ],
  "zh-Hant": [
    "說明 TrialBridge TW 的台灣優先搜尋方法與隱私界線。",
    "搜尋胃癌目前公開招募中的臨床試驗。",
    "顯示比較結果前，還有哪些試驗條件需要我回答？",
    "依照我已確認的結果建立照護團隊討論摘要。",
    "比較我加入 shortlist 的試驗。",
  ],
};

export function WebMcpBridge({ profile, matches, shortlistedTrialIds, pendingQuestions, matching, sensitiveConsent, language }: { profile?: ConfirmedProfile; matches: TrialMatch[]; shortlistedTrialIds: string[]; pendingQuestions: FollowUpQuestion[]; matching: boolean; sensitiveConsent: boolean; language: Language }) {
  const [registrationState, setRegistrationState] = useState<RegistrationState>("checking");
  const [registeredNames, setRegisteredNames] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedPrompt, setCopiedPrompt] = useState<number>();
  const [receiptDownloaded, setReceiptDownloaded] = useState(false);
  const [lastActivity, setLastActivity] = useState<WebMcpActivity>();
  const [receiptEvents, setReceiptEvents] = useState<WebMcpReceiptEvent[]>([]);
  const receiptSequence = useRef(0);
  const nextReceiptMetadata = useCallback(() => ({ id: ++receiptSequence.current, occurredAt: new Date().toISOString() }), []);
  const recordActivity = useCallback((activity: WebMcpActivity) => {
    setLastActivity(activity);
    const metadata = nextReceiptMetadata();
    setReceiptEvents((current) => appendToolExecution(current, activity.toolName, activity.state, metadata.occurredAt, metadata.id));
  }, [nextReceiptMetadata]);
  const tools = useMemo(() => buildTrialBridgeTools({ profile, matches, shortlistedTrialIds, pendingQuestions, matching, sensitiveConsent, onActivity: recordActivity }), [profile, matches, shortlistedTrialIds, pendingQuestions, matching, sensitiveConsent, recordActivity]);
  const contextualUnlocked = Boolean(profile && sensitiveConsent);

  useEffect(() => {
    if (!contextualUnlocked) setLastActivity(undefined);
  }, [contextualUnlocked]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const modelContext = document.modelContext;

    setRegisteredNames([]);
    setErrorMessage("");
    if (!modelContext) {
      setRegistrationState("unsupported");
      const metadata = nextReceiptMetadata();
      setReceiptEvents((current) => appendRuntimeState(current, "unsupported", metadata.occurredAt, metadata.id));
      return () => controller.abort();
    }

    setRegistrationState("registering");
    void (async () => {
      try {
        await Promise.all(tools.map((tool) => modelContext.registerTool(tool, { signal: controller.signal, exposedTo: [location.origin] })));
        const discoverable = await modelContext.getTools({ fromOrigins: [location.origin] });
        if (!active) return;
        const expectedNames = new Set(tools.map((tool) => tool.name));
        const verifiedNames = [...new Set(discoverable.map((tool) => tool.name).filter((name) => expectedNames.has(name)))];
        setRegisteredNames(verifiedNames);
        if (verifiedNames.length !== expectedNames.size) {
          setErrorMessage(`Expected ${expectedNames.size} tools but verified ${verifiedNames.length}.`);
          setRegistrationState("error");
          const metadata = nextReceiptMetadata();
          setReceiptEvents((current) => appendRuntimeState(current, "error", metadata.occurredAt, metadata.id));
        } else {
          setRegistrationState("ready");
          const metadata = nextReceiptMetadata();
          setReceiptEvents((current) => appendCapabilitySet(current, verifiedNames, metadata.occurredAt, metadata.id));
        }
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setErrorMessage(error instanceof Error ? error.message : "WebMCP registration failed");
        setRegistrationState("error");
        const metadata = nextReceiptMetadata();
        setReceiptEvents((current) => appendRuntimeState(current, "error", metadata.occurredAt, metadata.id));
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [tools, nextReceiptMetadata]);

  const copy = language === "en" ? {
    state: {
      checking: "Checking browser support",
      unsupported: "Browser API not detected · website remains fully usable",
      registering: `Registering ${tools.length} tools`,
      ready: `${registeredNames.length} of ${tools.length} tools verified in this browser`,
      error: "Tool registration needs attention",
    },
    title: "WebMCP Live",
    summary: "Inspect the agent capability layer",
    publicTitle: "Public tools",
    contextualTitle: "Confirmed-context tools",
    active: "Active",
    locked: "Locked until confirmed summary permission",
    shortlistLocked: "Select 2 trials to activate",
    unavailable: "Requires a WebMCP-enabled browser",
    safety: "All tools are read-only. Raw and masked notes are never exposed. Public registry content is marked untrusted.",
    tryTitle: "Judge prompts",
    copyPrompt: "Copy prompt",
    copied: "Copied",
    receiptTitle: "Session capability receipt",
    receiptSubtitle: "Local to this tab · capability metadata only",
    receiptPrivacy: "Records tool names and lifecycle states—not medical content, prompts, arguments, or outputs.",
    receiptEmpty: "No capability lifecycle event has been observed yet.",
    receiptDownload: "Download JSON receipt",
    receiptDownloaded: "Downloaded",
    setup: "Enable local WebMCP in Chrome",
    method: "Why WebMCP matters",
    activity: {
      running: "Agent tool is running",
      completed: "Agent tool completed · continue in the visible workflow",
      failed: "Agent tool failed · retry or continue in the visible workflow",
      cancelled: "Agent tool cancelled · no page data was changed",
    },
  } : {
    state: {
      checking: "正在檢查瀏覽器支援",
      unsupported: "未偵測到瀏覽器 API · 網站仍可完整使用",
      registering: `正在註冊 ${tools.length} 項工具`,
      ready: `此瀏覽器已驗證 ${registeredNames.length}/${tools.length} 項工具`,
      error: "工具註冊需要處理",
    },
    title: "WebMCP 即時狀態",
    summary: "檢查 Agent 能力層",
    publicTitle: "公開工具",
    contextualTitle: "確認摘要工具",
    active: "已啟用",
    locked: "確認摘要並授權後啟用",
    shortlistLocked: "選擇 2 項試驗後啟用",
    unavailable: "需要支援 WebMCP 的瀏覽器",
    safety: "全部工具均為唯讀；原始與遮蔽病歷不會公開，公開登錄內容會標示為不受信任資料。",
    tryTitle: "評審測試語句",
    copyPrompt: "複製語句",
    copied: "已複製",
    receiptTitle: "本次能力活動收據",
    receiptSubtitle: "僅限目前分頁 · 只有能力中繼資料",
    receiptPrivacy: "只記錄工具名稱與生命週期狀態，不含病歷內容、提示語、參數或輸出。",
    receiptEmpty: "目前尚未觀察到能力生命週期事件。",
    receiptDownload: "下載 JSON 收據",
    receiptDownloaded: "已下載",
    setup: "在 Chrome 啟用本機 WebMCP",
    method: "為什麼 WebMCP 很重要",
    activity: {
      running: "Agent 工具執行中",
      completed: "Agent 工具已完成 · 請在可見流程中繼續",
      failed: "Agent 工具失敗 · 可重試或在可見流程中繼續",
      cancelled: "Agent 工具已取消 · 頁面資料未變更",
    },
  };

  async function copyJudgePrompt(prompt: string, index: number) {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(index);
      window.setTimeout(() => setCopiedPrompt((current) => current === index ? undefined : current), 2_000);
    } catch {
      setCopiedPrompt(undefined);
    }
  }

  function downloadSessionReceipt() {
    if (receiptEvents.length === 0) return;
    const generatedAt = new Date().toISOString();
    const receipt = createWebMcpSessionReceipt(receiptEvents, generatedAt, location.origin);
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(receipt, null, 2)}\n`], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `trialbridge-webmcp-receipt-${generatedAt.slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setReceiptDownloaded(true);
    window.setTimeout(() => setReceiptDownloaded(false), 4_000);
  }

  function toolState(name: string, contextual: boolean) {
    if (registrationState === "unsupported") return { label: copy.unavailable, className: "tool-unavailable" };
    if (registrationState === "ready" && registeredNames.includes(name)) return { label: copy.active, className: "tool-active" };
    if (contextual && !contextualUnlocked) return { label: copy.locked, className: "tool-locked" };
    if (name === "compare_shortlisted_trials" && shortlistedTrialIds.length < 2) return { label: copy.shortlistLocked, className: "tool-locked" };
    return { label: copy.state[registrationState], className: "tool-pending" };
  }

  return <><details className={`webmcp-live-panel webmcp-${registrationState}`}>
    <summary>
      <span className="webmcp-live-mark" aria-hidden="true" />
      <span className="webmcp-live-heading"><strong>{copy.title}</strong><small>{copy.summary}</small></span>
      <span className="webmcp-live-status" role="status" aria-atomic="true">{copy.state[registrationState]}</span>
    </summary>
    <div className="webmcp-live-body">
      <div className="webmcp-tool-groups">
        <ToolGroup title={copy.publicTitle} names={publicToolNames} getState={(name) => toolState(name, false)} />
        <ToolGroup title={copy.contextualTitle} names={contextualToolNames} getState={(name) => toolState(name, true)} />
      </div>
      {registrationState === "error" && <p className="webmcp-error" role="alert">{errorMessage}</p>}
      <p className="webmcp-safety-note">{copy.safety}</p>
      <div className="webmcp-judge-prompts">
        <div><strong>{copy.tryTitle}</strong><span>{language === "en" ? "Use in Model Context Tool Inspector" : "可貼入 Model Context Tool Inspector"}</span></div>
        {judgePrompts[language].map((prompt, index) => <div className="judge-prompt" key={prompt}><code>{prompt}</code><button type="button" onClick={() => void copyJudgePrompt(prompt, index)}>{copiedPrompt === index ? copy.copied : copy.copyPrompt}</button></div>)}
      </div>
      <SessionCapabilityReceipt events={receiptEvents} language={language} activityCopy={copy.activity} title={copy.receiptTitle} subtitle={copy.receiptSubtitle} privacy={copy.receiptPrivacy} empty={copy.receiptEmpty} downloadLabel={receiptDownloaded ? copy.receiptDownloaded : copy.receiptDownload} onDownload={downloadSessionReceipt} />
      <div className="webmcp-live-links"><a href="https://developer.chrome.com/docs/ai/webmcp" target="_blank" rel="noreferrer">{copy.setup}</a><a href="/method">{copy.method}</a></div>
    </div>
  </details>{lastActivity && <p className={`webmcp-agent-activity activity-${lastActivity.state}`} role="status" aria-atomic="true"><strong>{lastActivity.toolName}</strong><span>{copy.activity[lastActivity.state]}</span></p>}</>;
}

function ToolGroup({ title, names, getState }: { title: string; names: string[]; getState: (name: string) => { label: string; className: string } }) {
  return <section className="webmcp-tool-group" aria-label={title}><h3>{title}</h3><ul>{names.map((name) => {
    const state = getState(name);
    return <li key={name}><code>{name}</code><span className={state.className}>{state.label}</span></li>;
  })}</ul></section>;
}

function SessionCapabilityReceipt({ events, language, activityCopy, title, subtitle, privacy, empty, downloadLabel, onDownload }: {
  events: WebMcpReceiptEvent[];
  language: Language;
  activityCopy: Record<WebMcpActivity["state"], string>;
  title: string;
  subtitle: string;
  privacy: string;
  empty: string;
  downloadLabel: string;
  onDownload: () => void;
}) {
  return <section className="webmcp-session-receipt" aria-labelledby="webmcp-session-receipt-title">
    <div className="receipt-heading">
      <div><strong id="webmcp-session-receipt-title">{title}</strong><span>{subtitle}</span></div>
      <button type="button" disabled={events.length === 0} onClick={onDownload}>{downloadLabel}</button>
    </div>
    <p>{privacy}</p>
    {events.length === 0 ? <p className="receipt-empty">{empty}</p> : <ol>{events.slice(-6).reverse().map((event) => {
      const time = `${event.occurredAt.slice(11, 19)} UTC`;
      if (event.kind === "capability_set") {
        const change = [
          event.addedToolNames.length > 0 ? `${language === "en" ? "Added" : "新增"} ${event.addedToolNames.join(", ")}` : "",
          event.removedToolNames.length > 0 ? `${language === "en" ? "Removed" : "移除"} ${event.removedToolNames.join(", ")}` : "",
        ].filter(Boolean).join(" · ");
        return <li key={event.id}><time dateTime={event.occurredAt}>{time}</time><div><strong>{language === "en" ? `${event.toolNames.length} tools verified` : `已驗證 ${event.toolNames.length} 項工具`}</strong><code>{change || (language === "en" ? "Capability set unchanged" : "能力集合未變更")}</code></div></li>;
      }
      if (event.kind === "tool_execution") return <li key={event.id}><time dateTime={event.occurredAt}>{time}</time><div><strong>{event.toolName}</strong><span>{activityCopy[event.state]}</span></div></li>;
      return <li key={event.id}><time dateTime={event.occurredAt}>{time}</time><div><strong>{event.state === "unsupported" ? (language === "en" ? "Browser API unavailable" : "瀏覽器 API 不可用") : (language === "en" ? "Registration error" : "工具註冊錯誤")}</strong><span>{language === "en" ? "No medical content was recorded." : "未記錄任何病歷內容。"}</span></div></li>;
    })}</ol>}
  </section>;
}
