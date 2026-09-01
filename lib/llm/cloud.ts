import { z } from "zod";
import { confirmedProfileSchema } from "../profile/schema.ts";
import { validatedLoopbackBaseUrl } from "./ollama.ts";

const trialContextSchema = z.object({ registryId: z.string().max(80), title: z.string().max(500), status: z.string().max(80), sourceUrl: z.string().url(), shortlisted: z.boolean().default(false) }).strict();
export const cloudDialogueRequestSchema = z.object({
  profile: confirmedProfileSchema.refine((profile) => profile.cloudUseApproved, "Cloud use requires explicit approval"),
  question: z.string().trim().min(2).max(1_000),
  trials: z.array(trialContextSchema).max(5).default([]),
  language: z.enum(["zh-Hant", "en"]),
}).strict();

export const requiredCloudModel = "gpt-oss:120b-cloud";

export function validatedCloudModel(value = process.env.OLLAMA_CLOUD_MODEL ?? requiredCloudModel): string {
  const model = value.trim();
  if (model !== requiredCloudModel) throw new Error(`Ollama cloud model must be ${requiredCloudModel}`);
  return model;
}

export async function answerConfirmedDialogue(input: z.infer<typeof cloudDialogueRequestSchema>, fetcher: typeof fetch = fetch) {
  const parsed = cloudDialogueRequestSchema.parse(input);
  const minimizedProfile = parsed.profile.facts.map((fact) => ({ id: fact.id, domain: fact.domain, value: fact.value }));
  const response = await fetcher(new URL("/api/chat", validatedLoopbackBaseUrl()), {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ model: validatedCloudModel(), stream: false, think: false, options: { temperature: 0.2, num_predict: 4096 }, messages: [
      { role: "system", content: `You help a patient or caregiver understand public clinical-trial information in ${parsed.language}. Use only the confirmed summary and registry context. When the question refers to the shortlist or selected trials, compare only publicTrials marked shortlisted=true; if fewer than two are marked, ask the person to select more instead of guessing. Distinguish registry facts, interpretation, and unknowns. Never diagnose, recommend treatment, claim benefit, or determine eligibility. End with questions for the care or study team.` },
      { role: "user", content: JSON.stringify({ confirmedSummary: minimizedProfile, publicTrials: parsed.trials, question: parsed.question }) },
    ] }),
  });
  if (!response.ok) throw new Error(`Cloud dialogue returned HTTP ${response.status}`);
  const payload = z.object({ message: z.object({ content: z.string().min(1).max(12_000) }) }).parse(await response.json());
  return { answer: payload.message.content, model: validatedCloudModel(), persisted: false as const };
}
