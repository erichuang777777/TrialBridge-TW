import { z } from "zod";
import { confirmedProfileSchema } from "../profile/schema.ts";
import { acceptedCloudModelLabels, ollamaRequestHeaders, requiredCloudModelByTransport, resolveOllamaEndpoint, resolveOllamaTransport, type OllamaEnvironment } from "./ollama.ts";

const trialContextSchema = z.object({ registryId: z.string().max(80), title: z.string().max(500), status: z.string().max(80), sourceUrl: z.string().url(), shortlisted: z.boolean().default(false) }).strict();
export const cloudDialogueRequestSchema = z.object({
  profile: confirmedProfileSchema.refine((profile) => profile.cloudUseApproved, "Cloud use requires explicit approval"),
  question: z.string().trim().min(2).max(1_000),
  trials: z.array(trialContextSchema).max(5).default([]),
  language: z.enum(["zh-Hant", "en"]),
}).strict();

/** Canonical product label for the only permitted model (loopback wire name). */
export const requiredCloudModel = "gpt-oss:120b-cloud";

/**
 * Validates the configured model and returns the wire name for the active
 * transport. Both `gpt-oss:120b-cloud` and `gpt-oss:120b` label the same
 * hosted model, so either is accepted in OLLAMA_CLOUD_MODEL; anything else is
 * rejected. No local GPU or CPU model can be configured.
 */
export function validatedCloudModel(value?: string, environment: OllamaEnvironment = process.env as OllamaEnvironment): string {
  const transport = resolveOllamaTransport(environment);
  const configured = (value ?? environment.OLLAMA_CLOUD_MODEL ?? requiredCloudModel).trim();
  if (!acceptedCloudModelLabels.has(configured)) throw new Error(`Ollama cloud model must be ${requiredCloudModel}`);
  return requiredCloudModelByTransport[transport];
}

export async function answerConfirmedDialogue(input: z.infer<typeof cloudDialogueRequestSchema>, fetcher: typeof fetch = fetch) {
  const parsed = cloudDialogueRequestSchema.parse(input);
  const minimizedProfile = parsed.profile.facts.map((fact) => ({ id: fact.id, domain: fact.domain, value: fact.value }));
  const endpoint = resolveOllamaEndpoint();
  const response = await fetcher(endpoint.chatUrl, {
    method: "POST", headers: ollamaRequestHeaders(endpoint), signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ model: validatedCloudModel(), stream: false, think: false, options: { temperature: 0.2, num_predict: 2048 }, messages: [
      { role: "system", content: `You help a patient or caregiver understand public clinical-trial information in ${parsed.language}. Use only the confirmed summary and registry context. When the question refers to the shortlist or selected trials, compare only publicTrials marked shortlisted=true; if fewer than two are marked, ask the person to select more instead of guessing. Distinguish registry facts, interpretation, and unknowns. Never diagnose, recommend treatment, claim benefit, or determine eligibility. End with questions for the care or study team.` },
      { role: "user", content: JSON.stringify({ confirmedSummary: minimizedProfile, publicTrials: parsed.trials, question: parsed.question }) },
    ] }),
  });
  if (!response.ok) throw new Error(`Cloud dialogue returned HTTP ${response.status}`);
  const payload = z.object({ message: z.object({ content: z.string().min(1).max(12_000) }) }).parse(await response.json());
  return { answer: payload.message.content, model: validatedCloudModel(), transport: endpoint.transport, persisted: false as const };
}
