"use client";

import { useState } from "react";
import { FOLLOW_UP_UNKNOWN, type FollowUpQuestion } from "@/lib/matching/followUp";

export function ClarificationPanel({ questions, language, answers, onAnswersChange, onConfirm }: {
  questions: FollowUpQuestion[];
  language: "en" | "zh-Hant";
  answers: Record<string, string>;
  onAnswersChange: (answers: Record<string, string>) => void;
  onConfirm: (answers: Record<string, string>) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const responded = questions.filter((question) => Boolean(answers[question.id]?.trim())).length;
  const allResponded = responded === questions.length;

  function updateAnswer(id: string, value: string) {
    onAnswersChange({ ...answers, [id]: value });
  }

  async function submit() {
    if (!allResponded || submitting) return;
    setSubmitting(true);
    try { await onConfirm(answers); } finally { setSubmitting(false); }
  }

  return <section className="clarification-panel" aria-labelledby="clarification-title">
    <div className="clarification-heading">
      <div><p className="eyebrow">{language === "en" ? "Before showing results" : "顯示結果之前"}</p><h3 id="clarification-title">{language === "en" ? "A few trial requirements need your input" : "部分試驗條件需要先向您確認"}</h3><p>{language === "en" ? "These questions come from public registry fields across the candidate trials. Answer from the medical record, or choose I don't know." : "問題來自候選試驗的公開登錄欄位。請依病歷回答；不確定時請選擇「不知道」。"}</p></div>
      <span role="status" aria-live="polite">{responded}/{questions.length}</span>
    </div>
    <div className="clarification-list">{questions.map((question) => {
      const unknown = answers[question.id] === FOLLOW_UP_UNKNOWN;
      return <fieldset key={question.id} className="clarification-question">
        <legend>{language === "en" ? question.questionEn : question.questionZhHant}</legend>
        <p>{language === "en" ? question.reasonEn : question.reasonZhHant} · {question.trialCount} {language === "en" ? "candidate trial(s)" : "個候選試驗"} · {language === "en" ? "Registry field" : "登錄欄位"}: {question.registryField}</p>
        <label htmlFor={question.id}>{language === "en" ? "Your answer" : "您的回答"}</label>
        <textarea id={question.id} rows={2} disabled={unknown} value={unknown ? "" : answers[question.id] ?? ""} onChange={(event) => updateAnswer(question.id, event.target.value)} />
        <label className="unknown-check"><input type="checkbox" checked={unknown} onChange={(event) => updateAnswer(question.id, event.target.checked ? FOLLOW_UP_UNKNOWN : "")} />{language === "en" ? "I don't know" : "我不知道"}</label>
      </fieldset>;
    })}</div>
    <p className="field-helper">{language === "en" ? "Do not enter names, contact details, record numbers, or other identifiers. Unknown answers are not added to the profile." : "請勿輸入姓名、聯絡方式、病歷號或其他識別資訊；選擇不知道的項目不會加入摘要。"}</p>
    <button className="primary-action clarification-submit" disabled={!allResponded || submitting} onClick={() => void submit()}>{submitting ? (language === "en" ? "Updating comparison…" : "正在更新比較…") : (language === "en" ? "Use answers and show results" : "使用回答並顯示結果")}</button>
  </section>;
}
