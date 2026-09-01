import type { ConfirmedProfile } from "../profile/schema.ts";
import type { NormalizedTrial } from "../trials/types.ts";

export function createOutreachDraft(profile: ConfirmedProfile, trial: NormalizedTrial, language: "zh-Hant" | "en") {
  const facts = profile.facts.map((fact) => `- ${language === "en" ? fact.displayEn : fact.displayZhHant}`).join("\n");
  const subject = language === "en" ? `Question about ${trial.sources[0].registryId}` : `詢問臨床試驗 ${trial.sources[0].registryId}`;
  const body = language === "en"
    ? `Hello study team,\n\nI am writing to ask whether this study may be appropriate to discuss with my care team. My confirmed, de-identified summary is:\n${facts}\n\nCould you tell me what records or screening information you need?\n\nThis message is a draft and has not been sent.`
    : `試驗團隊您好：\n\n我想詢問這項研究是否適合帶回醫療團隊討論。以下是經本人確認、去識別的摘要：\n${facts}\n\n請問初步聯絡或篩選需要準備哪些病歷資料？\n\n此內容只是草稿，尚未寄出。`;
  return { subject, body, sent: false as const, registryId: trial.sources[0].registryId };
}
