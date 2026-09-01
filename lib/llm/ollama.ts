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
  modelPreference: z.enum(["gpu", "cpu"]).default("gpu"),
}).strict();

export type LocalExtractionRequest = z.input<typeof localExtractionRequestSchema>;

export function validatedLoopbackBaseUrl(value = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"): URL {
  const url = new URL(value);
  const allowedHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (url.protocol !== "http:" || !allowedHosts.has(url.hostname) || url.username || url.password) {
    throw new Error("Ollama base URL must be an unauthenticated HTTP loopback address");
  }
  return url;
}

function validatedExtractionModel(value: string): string {
  const model = value.trim();
  if (!/^[a-z0-9][a-z0-9._/-]*(?::[a-z0-9._-]+)?$/i.test(model)) throw new Error("Invalid Ollama model name");
  if (/:(?:[a-z0-9._-]+-)?cloud$/i.test(model)) throw new Error("Cloud models are forbidden for raw extraction");
  return model;
}

export function validatedLocalModel(value = process.env.OLLAMA_LOCAL_MODEL ?? "medgemma:4b"): string {
  return validatedExtractionModel(value);
}

export function validatedCpuFallbackModel(value = process.env.OLLAMA_CPU_MODEL ?? "medgemma-cpu:latest"): string {
  return validatedExtractionModel(value);
}

export class LocalExtractionError extends Error {
  readonly code: "GPU_UNAVAILABLE" | "MODEL_TIMEOUT" | "LOCAL_MODEL_ERROR";
  readonly model: string;

  constructor(
    message: string,
    code: "GPU_UNAVAILABLE" | "MODEL_TIMEOUT" | "LOCAL_MODEL_ERROR",
    model: string,
  ) {
    super(message);
    this.name = "LocalExtractionError";
    this.code = code;
    this.model = model;
  }
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
  const result = await extractProfileLocallyWithMetadata(input, fetcher);
  return result.draft;
}

export async function extractProfileLocallyWithMetadata(
  input: LocalExtractionRequest,
  fetcher: typeof fetch = fetch,
  requestSignal?: AbortSignal,
): Promise<{ draft: ProfileDraft; model: string; accelerator: "gpu" | "cpu" }> {
  const parsedInput = localExtractionRequestSchema.parse(input);
  const accelerator = parsedInput.modelPreference;
  const model = accelerator === "gpu" ? validatedLocalModel() : validatedCpuFallbackModel();
  const baseUrl = validatedLoopbackBaseUrl();
  const endpoint = new URL("/api/chat", baseUrl);
  const timeoutSignal = AbortSignal.timeout(accelerator === "gpu" ? 60_000 : 150_000);
  const signal = requestSignal ? AbortSignal.any([requestSignal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        keep_alive: "2m",
        options: { temperature: 0.1, num_predict: 1024 },
        messages: [
          { role: "system", content: extractionSystemPrompt(parsedInput.language, parsedInput.subjectRole) },
          { role: "user", content: parsedInput.maskedText },
        ],
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new LocalExtractionError("The local model did not finish before the time limit.", "MODEL_TIMEOUT", model);
    }
    throw new LocalExtractionError("The local Ollama connection failed.", "LOCAL_MODEL_ERROR", model);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const gpuFailure = accelerator === "gpu" && /cuda|ptx|llama-server process no longer running|gpu/i.test(detail);
    throw new LocalExtractionError(
      gpuFailure
        ? "The local GPU model could not start because the Ollama CUDA runtime is incompatible with this device."
        : `Local Ollama returned HTTP ${response.status}.`,
      gpuFailure ? "GPU_UNAVAILABLE" : "LOCAL_MODEL_ERROR",
      model,
    );
  }
  const payload = ollamaResponseSchema.parse(await response.json());
  const extracted = modelExtractionSchema.parse(parseJsonContent(payload.message.content));
  const draft = profileDraftSchema.parse({
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
  return { draft, model, accelerator };
}

export async function localOllamaStatus(fetcher: typeof fetch = fetch): Promise<{ available: boolean; model: string; cpuModel: string }> {
  const model = validatedLocalModel();
  const cpuModel = validatedCpuFallbackModel();
  try {
    const response = await fetcher(new URL("/api/tags", validatedLoopbackBaseUrl()), {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return { available: false, model, cpuModel };
    const payload = z.object({ models: z.array(z.object({ name: z.string() })) }).parse(await response.json());
    return { available: payload.models.some((candidate) => candidate.name === model), model, cpuModel };
  } catch {
    return { available: false, model, cpuModel };
  }
}
