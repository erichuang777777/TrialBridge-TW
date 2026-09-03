import { z } from "zod";
import { hasDirectIdentifiers } from "../privacy/mask.ts";
import { requiredCloudModel, validatedCloudModel } from "./cloud.ts";
import { ollamaRequestHeaders, resolveOllamaEndpoint } from "./ollama.ts";

const intakeStageSchema = z.enum(["mode", "privacy", "capture", "mask_review", "extracting", "confirmation", "ready"]);
const workflowActionSchema = z.enum(["accept_privacy", "append_medical_note", "organize_medical_note", "confirm_all_facts", "continue_confirmed_summary", "answer_current_question", "show_results", "none"]);

export const guidedIntakeRequestSchema = z.object({
  stage: intakeStageSchema,
  language: z.enum(["zh-Hant", "en"]),
  maskedMessage: z.string().trim().min(2).max(2_000),
  context: z.object({
    confirmedDomains: z.array(z.string().max(60)).max(30).default([]),
    currentQuestion: z.string().max(800).optional(),
    hasResults: z.boolean().default(false),
    allFactsConfirmed: z.boolean().default(false),
    allFollowUpsAnswered: z.boolean().default(false),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if (hasDirectIdentifiers(value.maskedMessage)) ctx.addIssue({ code: "custom", path: ["maskedMessage"], message: "Direct identifiers remain after masking" });
});

const guidedIntakeResponseSchema = z.object({
  reply: z.string().trim().min(1).max(4_000),
  workflowAction: workflowActionSchema,
}).strict();

type GuidedIntakeResponse = z.infer<typeof guidedIntakeResponseSchema>;

function asksForIdentityRole(reply: string): boolean {
  const rolePair = /(?:patient.{0,80}(?:caregiver|care\s+giver|family\s+member)|(?:caregiver|care\s+giver|family\s+member).{0,80}patient|(?:病人|患者).{0,40}(?:家屬|照顧者|照護者)|(?:家屬|照顧者|照護者).{0,40}(?:病人|患者))/iu;
  const questionCue = /[?？]|\b(?:are|which|who)\s+you\b|\bdo\s+you\s+(?:identify|consider)\b|(?:請問|你是|您是|身分|身份)/iu;
  return rolePair.test(reply) && questionCue.test(reply);
}

function identityFreeFallback(stage: z.infer<typeof intakeStageSchema>, language: "zh-Hant" | "en"): string {
  if (language === "zh-Hant") {
    if (stage === "privacy") return "不需要選擇身分。請先閱讀中間工作區的隱私說明，再決定是否繼續。";
    if (stage === "capture") return "不需要選擇身分。請直接描述已知的診斷、期別、生物標記、治療、年齡或可旅行地區。";
    if (stage === "confirmation") return "不需要選擇身分。請直接核對中間工作區的整理結果，並修改任何不正確的欄位。";
    return "不需要選擇身分。請直接繼續目前工作區顯示的步驟。";
  }
  if (stage === "privacy") return "No role selection is needed. Review the privacy note in the middle panel before continuing.";
  if (stage === "capture") return "No role selection is needed. Describe the known diagnosis, stage, biomarkers, treatments, age, or travel range.";
  if (stage === "confirmation") return "No role selection is needed. Review the extracted facts in the middle panel and correct anything that is not accurate.";
  return "No role selection is needed. Continue with the step shown in the middle panel.";
}

function enforceIdentityFreeIntake(response: GuidedIntakeResponse, stage: z.infer<typeof intakeStageSchema>, language: "zh-Hant" | "en"): GuidedIntakeResponse {
  if (!asksForIdentityRole(response.reply)) return response;
  return { reply: identityFreeFallback(stage, language), workflowAction: "none" };
}

function parseJsonObject(value: string): unknown {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Guided intake did not return JSON");
  return JSON.parse(value.slice(start, end + 1));
}

export async function answerGuidedIntake(input: z.infer<typeof guidedIntakeRequestSchema>, fetcher: typeof fetch = fetch) {
  const parsed = guidedIntakeRequestSchema.parse(input);
  const endpoint = resolveOllamaEndpoint();
  const response = await fetcher(endpoint.chatUrl, {
    method: "POST", headers: ollamaRequestHeaders(endpoint), signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ model: validatedCloudModel(), stream: false, think: false, format: "json", options: { temperature: 0.2, num_predict: 1200 }, messages: [
      { role: "system", content: [
        `You are the guided intake assistant for TrialBridge TW. Reply in ${parsed.language}.`,
        "Help the person complete the visible clinical-trial matching workflow one step at a time. Never ask for an identity, relationship, or role selection; it is not part of this workflow.",
        "Do not diagnose, recommend treatment, claim benefit, or determine eligibility. Never invent a medical fact or mark a fact confirmed.",
        "Return only JSON: {\"reply\":\"short supportive response and at most one next question\",\"workflowAction\":\"...\"}.",
        "Allowed workflowAction values: accept_privacy, append_medical_note, organize_medical_note, confirm_all_facts, continue_confirmed_summary, answer_current_question, show_results, none.",
        "Use accept_privacy only for an explicit acknowledgement. Use append_medical_note only when the message actually contains medical or travel information. Use organize_medical_note only when the user explicitly says the note is complete and asks to organize or continue. Use confirm_all_facts only when the user explicitly says they reviewed and confirm every visible fact. Use continue_confirmed_summary only after facts are already confirmed and the user explicitly asks to continue. Use answer_current_question only when a currentQuestion is present and the message answers it. Use show_results only when all visible follow-up questions already have answers and the user explicitly asks to continue. Otherwise use none.",
      ].join(" ") },
      { role: "user", content: JSON.stringify({ stage: parsed.stage, context: parsed.context, message: parsed.maskedMessage }) },
    ] }),
  });
  if (!response.ok) throw new Error(`Guided intake returned HTTP ${response.status}`);
  const payload = z.object({ message: z.object({ content: z.string().min(1).max(8_000) }) }).parse(await response.json());
  const guided = guidedIntakeResponseSchema.parse(parseJsonObject(payload.message.content));
  return { ...enforceIdentityFreeIntake(guided, parsed.stage, parsed.language), model: requiredCloudModel, transport: endpoint.transport, persisted: false as const };
}
