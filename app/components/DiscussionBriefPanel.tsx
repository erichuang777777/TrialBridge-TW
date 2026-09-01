"use client";

import { useState } from "react";
import type { TrialDiscussionBrief } from "@/lib/matching/discussionBrief";

export function DiscussionBriefPanel({ brief, language, onClose }: { brief: TrialDiscussionBrief; language: "zh-Hant" | "en"; onClose: () => void }) {
  const [downloaded, setDownloaded] = useState(false);

  function downloadMarkdown() {
    const blob = new Blob([brief.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "trialbridge-care-team-discussion-brief.md";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setDownloaded(true);
    window.setTimeout(() => setDownloaded(false), 4_000);
  }

  return <section className="discussion-brief-panel" aria-labelledby="discussion-brief-title">
    <div className="discussion-brief-heading">
      <div><p className="eyebrow">{language === "en" ? "Local discussion artifact" : "本機討論文件"}</p><h3 id="discussion-brief-title">{brief.title}</h3></div>
      <span>{brief.trialCount} {language === "en" ? "trials" : "項試驗"}</span>
    </div>
    <p className="discussion-brief-purpose">{language === "en" ? "Includes a care-team brief and a plain-language handout. It separates registry facts, comparison uncertainty, potential exclusion signals, and questions to discuss." : "包含照護團隊摘要與白話討論單，分開呈現登錄事實、比較不確定性、可能排除訊號與待討論問題。"}</p>
    <label htmlFor="discussion-brief-preview">{language === "en" ? "Preview" : "預覽"}</label>
    <textarea id="discussion-brief-preview" rows={18} value={brief.markdown} readOnly />
    <div className="discussion-brief-warning" role="note"><strong>{language === "en" ? "Contains confirmed health information" : "包含已確認的健康資訊"}</strong><p>{language === "en" ? "The file is created and downloaded only in this browser. Store and share it securely. TrialBridge TW does not send it." : "檔案只在目前瀏覽器建立並下載，請安全保存與分享；TrialBridge TW 不會寄送此檔案。"}</p></div>
    <div className="discussion-brief-actions"><button type="button" onClick={onClose}>{language === "en" ? "Close preview" : "關閉預覽"}</button><button className="primary-action" type="button" onClick={downloadMarkdown}>{language === "en" ? "Download Markdown" : "下載 Markdown"}</button></div>
    <p className="download-status" role="status" aria-atomic="true">{downloaded ? (language === "en" ? "Discussion brief downloaded to this device." : "討論摘要已下載至此裝置。") : ""}</p>
  </section>;
}
