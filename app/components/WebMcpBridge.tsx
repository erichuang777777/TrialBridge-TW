"use client";

import { useEffect, useMemo, useState } from "react";
import { buildTrialBridgeTools } from "@/lib/webmcp/tools";
import type { TrialMatch } from "@/lib/matching/engine";
import type { ConfirmedProfile } from "@/lib/profile/schema";

type RegistrationState = "checking" | "unsupported" | "registering" | "ready" | "error";
type Language = "zh-Hant" | "en";

const publicToolNames = ["trialbridge_method", "search_public_cancer_trials"];
const contextualToolNames = ["explain_confirmed_matches", "draft_trial_outreach"];

const judgePrompts = {
  en: [
    "Explain TrialBridge TW's Taiwan-first method and privacy boundary.",
    "Search public recruiting cancer trials for gastric cancer.",
  ],
  "zh-Hant": [
    "說明 TrialBridge TW 的台灣優先搜尋方法與隱私界線。",
    "搜尋胃癌目前公開招募中的臨床試驗。",
  ],
};

export function WebMcpBridge({ profile, matches, sensitiveConsent, language }: { profile?: ConfirmedProfile; matches: TrialMatch[]; sensitiveConsent: boolean; language: Language }) {
  const [registrationState, setRegistrationState] = useState<RegistrationState>("checking");
  const [registeredNames, setRegisteredNames] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedPrompt, setCopiedPrompt] = useState<number>();
  const tools = useMemo(() => buildTrialBridgeTools({ profile, matches, sensitiveConsent }), [profile, matches, sensitiveConsent]);
  const contextualUnlocked = Boolean(profile && sensitiveConsent);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const modelContext = document.modelContext;

    setRegisteredNames([]);
    setErrorMessage("");
    if (!modelContext) {
      setRegistrationState("unsupported");
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
        } else {
          setRegistrationState("ready");
        }
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setErrorMessage(error instanceof Error ? error.message : "WebMCP registration failed");
        setRegistrationState("error");
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [tools]);

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
    unavailable: "Requires a WebMCP-enabled browser",
    safety: "All tools are read-only. Raw and masked notes are never exposed. Public registry content is marked untrusted.",
    tryTitle: "Judge prompts",
    copyPrompt: "Copy prompt",
    copied: "Copied",
    setup: "Enable local WebMCP in Chrome",
    method: "Why WebMCP matters",
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
    unavailable: "需要支援 WebMCP 的瀏覽器",
    safety: "全部工具均為唯讀；原始與遮蔽病歷不會公開，公開登錄內容會標示為不受信任資料。",
    tryTitle: "評審測試語句",
    copyPrompt: "複製語句",
    copied: "已複製",
    setup: "在 Chrome 啟用本機 WebMCP",
    method: "為什麼 WebMCP 很重要",
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

  function toolState(name: string, contextual: boolean) {
    if (registrationState === "unsupported") return { label: copy.unavailable, className: "tool-unavailable" };
    if (registrationState === "ready" && registeredNames.includes(name)) return { label: copy.active, className: "tool-active" };
    if (contextual && !contextualUnlocked) return { label: copy.locked, className: "tool-locked" };
    return { label: copy.state[registrationState], className: "tool-pending" };
  }

  return <details className={`webmcp-live-panel webmcp-${registrationState}`}>
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
      <div className="webmcp-live-links"><a href="https://developer.chrome.com/docs/ai/webmcp" target="_blank" rel="noreferrer">{copy.setup}</a><a href="/method">{copy.method}</a></div>
    </div>
  </details>;
}

function ToolGroup({ title, names, getState }: { title: string; names: string[]; getState: (name: string) => { label: string; className: string } }) {
  return <section className="webmcp-tool-group" aria-label={title}><h3>{title}</h3><ul>{names.map((name) => {
    const state = getState(name);
    return <li key={name}><code>{name}</code><span className={state.className}>{state.label}</span></li>;
  })}</ul></section>;
}
