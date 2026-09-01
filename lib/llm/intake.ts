import { z } from "zod";
import { hasDirectIdentifiers } from "../privacy/mask.ts";
import { requiredCloudModel, validatedCloudModel } from "./cloud.ts";
import { validatedLoopbackBaseUrl } from "./ollama.ts";

const intakeStageSchema = z.enum(["mode", "privacy", "capture", "mask_review", "extracting", "confirmation", "ready"]);
const workflowActionSchema = z.enum(["accept_privacy", "append_medical_note", "organize_medical_note", "confirm_all_facts", "continue_confirmed_summary", "answer_current_question", "show_results", "none"]);

export const guidedIntakeRequestSchema = z.object({
  stage: intakeStageSchema,
  language: z.enum(["zh-Hant", "en"]),
  maskedMessage: z.string().trim().min(2).max(2_000),
  context: z.object({
    subjectRole: z.enum(["patient", "caregiver"]).optional(),
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

function parseJsonObject(value: string): unknown {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Guided intake did not return JSON");
  return JSON.parse(value.slice(start, end + 1));
}

export async function answerGuidedIntake(input: z.infer<typeof guidedIntakeRequestSchema>, fetcher: typeof fetch = fetch) {
  const parsed = guidedIntakeRequestSchema.parse(input);
  const response = await fetcher(new URL("/api/chat", validatedLoopbackBaseUrl()), {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ model: validatedCloudModel(), stream: false, think: false, format: "json", options: { temperature: 0.2, num_predict: 1200 }, messages: [
      { role: "system", content: [
        `You are the guided intake assistant for TrialBridge TW. Reply in ${parsed.language}.`,
        "Help the person complete the visible clinical-trial matching workflow one step at a time. Do not ask whether they are a patient or caregiver; that distinction is not part of this workflow.",
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
  return { ...guidedIntakeResponseSchema.parse(parseJsonObject(payload.message.content)), model: requiredCloudModel, persisted: false as const };
}
