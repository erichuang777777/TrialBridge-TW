"use client";

import { useState } from "react";
import type { TrialRevalidationResult } from "@/lib/trials/revalidation";

export function TrialRevalidation({ canonicalId, language = "en" }: { canonicalId: string; language?: "en" | "zh-Hant" }) {
  const [state, setState] = useState<"idle" | "checking" | "done" | "error">("idle");
  const [result, setResult] = useState<TrialRevalidationResult>();
  const labels = language === "en" ? {
    action: "Check current registry", checking: "Checking current registry…", error: "Current record could not be checked. Try again.",
    verified_current: "Current public record verified", changed: "Public record changed", limited: "Source requires manual confirmation", not_found: "Exact public record not found",
    changedFields: "Changes since local index", checked: "Checked",
  } : {
    action: "檢查目前登錄狀態", checking: "正在檢查目前登錄資料…", error: "目前無法檢查公開紀錄，請稍後重試。",
    verified_current: "已確認目前公開紀錄", changed: "公開紀錄已有變更", limited: "此來源需要人工確認", not_found: "找不到這筆公開紀錄",
    changedFields: "與本地索引的差異", checked: "檢查時間",
  };

  async function run() {
    setState("checking");
    setResult(undefined);
    try {
      const response = await fetch("/api/trials/revalidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canonicalId }) });
      const payload = await response.json() as TrialRevalidationResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Revalidation failed");
      setResult(payload);
      setState("done");
    } catch { setState("error"); }
  }

  return <div className="trial-revalidation">
    <button type="button" disabled={state === "checking"} onClick={() => void run()}>{state === "checking" ? labels.checking : labels.action}</button>
    <div className="trial-revalidation-status" role="status" aria-atomic="true">
      {state === "error" && <p className="revalidation-error">{labels.error}</p>}
      {state === "done" && result && <div className={`revalidation-result revalidation-${result.status}`}>
        <strong>{labels[result.status]}</strong>
        <span>{labels.checked}: <time dateTime={result.checkedAt}>{new Date(result.checkedAt).toLocaleString(language === "en" ? "en" : "zh-TW")}</time></span>
        <p>{result.limitation}</p>
        {result.changes.length > 0 && <details><summary>{labels.changedFields} · {result.changes.length}</summary><ul>{result.changes.map((change) => <li key={change.field}><strong>{change.field.replaceAll("_", " ")}</strong><span>{change.before} → {change.after}</span></li>)}</ul></details>}
        <a href={result.sourceUrl} target="_blank" rel="noreferrer">{result.registry}: {result.registryId}</a>
      </div>}
    </div>
  </div>;
}
