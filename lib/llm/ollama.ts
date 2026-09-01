import { z } from "zod";
import { profileDraftSchema, type ProfileDraft } from "../profile/schema.ts";

const ollamaResponseSchema = z.object({
  message: z.object({ content: z.string() }),
});

const modelExtractionSchema = z.object({
  facts: z.array(z.object({
    domain: z.enum([
      "cancer_type", "primary_site", "histology", "stage", "disease_extent", "biomarker",
      "prior_therapy", "current_therapy", "treatment_date", "performance_status", "organ_function",
      "age_band", "sex_eligibility", "travel_preference", "other_medical_fact",
    ]),
    value: z.string().min(1).max(500),
    displayZhHant: z.string().min(1).max(500),
    displayEn: z.string().min(1).max(500),
    confidence: z.number().min(0).max(1),
    evidenceExcerpt: z.string().max(240).optional(),
  })).max(80),
  missingQuestions: z.array(z.object({
    domain: z.enum([
      "cancer_type", "primary_site", "histology", "stage", "disease_extent", "biomarker",
      "prior_therapy", "current_therapy", "treatment_date", "performance_status", "organ_function",
      "age_band", "sex_eligibility", "travel_preference", "other_medical_fact",
    ]),
    questionZhHant: z.string().min(1).max(300),
    questionEn: z.string().min(1).max(300),
    reason: z.string().min(1).max(300),
  })).max(20),
});

export const localExtractionRequestSchema = z.object({
  maskedText: z.string().trim().min(20).max(30_000),
  subjectRole: z.enum(["patient", "caregiver"]),
  language: z.enum(["zh-Hant", "en", "mixed"]),
}).strict();

export type LocalExtractionRequest = z.infer<typeof localExtractionRequestSchema>;

export function validatedLoopbackBaseUrl(value = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"): URL {
  const url = new URL(value);
  const allowedHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (url.protocol !== "http:" || !allowedHosts.has(url.hostname) || url.username || url.password) {
    throw new Error("Ollama base URL must be an unauthenticated HTTP loopback address");
  }
  return url;
}

export function validatedLocalModel(value = process.env.OLLAMA_LOCAL_MODEL ?? "medgemma-cpu:latest"): string {
  const model = value.trim();
  if (!/^[a-z0-9][a-z0-9._/-]*(?::[a-z0-9._-]+)?$/i.test(model)) throw new Error("Invalid Ollama model name");
  if (model.toLocaleLowerCase("en").endsWith(":cloud")) throw new Error("Cloud models are forbidden for raw extraction");
  return model;
}

function extractionSystemPrompt(language: LocalExtractionRequest["language"], role: LocalExtractionRequest["subjectRole"]): string {
  return [
    "You extract oncology facts from identifier-masked text for patient review.",
    `The preferred language is ${language}; the speaker role is ${role}.`,
    "Return only this compact JSON shape: {\"facts\":[{\"domain\":\"cancer_type\",\"value\":\"...\",\"displayZhHant\":\"...\",\"displayEn\":\"...\",\"confidence\":0.0,\"evidenceExcerpt\":\"...\"}],\"missingQuestions\":[{\"domain\":\"stage\",\"questionZhHant\":\"...\",\"questionEn\":\"...\",\"reason\":\"...\"}]}",
    "Allowed domains: cancer_type, primary_site, histology, stage, disease_extent, biomarker, prior_therapy, current_therapy, treatment_date, performance_status, organ_function, age_band, sex_eligibility, travel_preference, other_medical_fact.",
    "Do not diagnose, recommend treatment, determine trial eligibility, or claim benefit.",
    "Do not invent missing values. Put important missing matching information in missingQuestions.",
    "Every fact is an unconfirmed draft: confirmed must always be false.",
    "Preserve uncertainty in the value and lower confidence when the text is ambiguous.",
    "Use month granularity for treatment dates unless greater precision is essential to the stated fact.",
    "Never reconstruct masked identifiers or include names, contact details, record numbers, exact addresses, or full birth dates.",
    "Provide both Traditional Chinese and English display text for every fact and question.",
    "The safety note must say that this is a draft for correction and not medical advice or a final eligibility decision.",
  ].join("\n");
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  return JSON.parse(withoutFence);
}

export async function extractProfileLocally(
  input: LocalExtractionRequest,
  fetcher: typeof fetch = fetch,
): Promise<ProfileDraft> {
  const parsedInput = localExtractionRequestSchema.parse(input);
  const baseUrl = validatedLoopbackBaseUrl();
  const endpoint = new URL("/api/chat", baseUrl);
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: validatedLocalModel(),
      stream: false,
      format: "json",
      options: { temperature: 0.1, num_predict: 1024 },
      messages: [
        { role: "system", content: extractionSystemPrompt(parsedInput.language, parsedInput.subjectRole) },
        { role: "user", content: parsedInput.maskedText },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`Local Ollama returned HTTP ${response.status}`);
  const payload = ollamaResponseSchema.parse(await response.json());
  const extracted = modelExtractionSchema.parse(parseJsonContent(payload.message.content));
  return profileDraftSchema.parse({
    schemaVersion: "1.0",
    language: parsedInput.language,
    subjectRole: parsedInput.subjectRole,
    facts: extracted.facts.map((fact, index) => ({
      ...fact,
      id: `fact_${fact.domain}_${index + 1}`,
      source: "masked_note",
      confirmed: false,
    })),
    missingQuestions: extracted.missingQuestions.map((question, index) => ({
      ...question,
      id: `question_${question.domain}_${index + 1}`,
    })),
    safetyNote: parsedInput.language === "en"
      ? "This is a draft for your correction, not medical advice or a final trial eligibility decision."
      : "這是供您修正的草稿，不是醫療建議，也不是最終臨床試驗資格判定。",
  });
}

export async function localOllamaStatus(fetcher: typeof fetch = fetch): Promise<{ available: boolean; model: string }> {
  const model = validatedLocalModel();
  try {
    const response = await fetcher(new URL("/api/tags", validatedLoopbackBaseUrl()), {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return { available: false, model };
    const payload = z.object({ models: z.array(z.object({ name: z.string() })) }).parse(await response.json());
    return { available: payload.models.some((candidate) => candidate.name === model), model };
  } catch {
    return { available: false, model };
  }
}
