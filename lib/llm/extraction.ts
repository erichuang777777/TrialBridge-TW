import { z } from "zod";
import { profileDraftSchema, type ProfileDraft } from "../profile/schema.ts";
import { validatedCloudModel } from "./cloud.ts";
import { ollamaRequestHeaders, resolveOllamaEndpoint, type OllamaTransport } from "./ollama.ts";

/** One Ollama chat chunk. A non-streamed reply is the same shape with the full content. */
const ollamaChunkSchema = z.object({
  model: z.string().trim().min(1).max(200).optional(),
  message: z.object({ content: z.string() }).optional(),
  done: z.boolean().optional(),
  done_reason: z.string().optional(),
});

/** Default server ceiling; deployments with short function limits lower it. */
export const cloudExtractionTimeoutMs = Math.max(10_000, Math.min(120_000, Number(process.env.CLOUD_EXTRACTION_TIMEOUT_MS) || 120_000));

export interface CloudExtractionProgress {
  /** Characters of structured draft received so far; never the text itself. */
  characters: number;
}

/**
 * Reads an Ollama chat response that may be newline-delimited JSON chunks
 * (`stream: true`) or a single JSON object. Only the running character count
 * leaves this function before validation, so partial model text is never
 * surfaced to callers.
 */
async function readOllamaChatContent(response: Response, onProgress?: (progress: CloudExtractionProgress) => void) {
  let content = "";
  let model: string | undefined;
  let doneReason: string | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const chunk = ollamaChunkSchema.parse(JSON.parse(line));
    model ??= chunk.model;
    content += chunk.message?.content ?? "";
    if (chunk.done_reason) doneReason = chunk.done_reason;
    onProgress?.({ characters: content.length });
  };
  if (!response.body) {
    consume(await response.text());
    return { content, model, doneReason };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      consume(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer);
  return { content, model, doneReason };
}
const factDomain = z.enum([
  "cancer_type", "primary_site", "histology", "stage", "disease_extent", "biomarker",
  "prior_therapy", "current_therapy", "treatment_date", "performance_status", "organ_function",
  "age_band", "sex_eligibility", "travel_preference", "other_medical_fact",
]);
const modelExtractionSchema = z.object({
  facts: z.array(z.object({
    domain: factDomain,
    value: z.string().min(1).max(500),
    displayZhHant: z.string().min(1).max(500),
    displayEn: z.string().min(1).max(500),
    confidence: z.number().min(0).max(1),
    evidenceExcerpt: z.string().max(240).optional(),
  })).max(80),
  missingQuestions: z.array(z.object({
    domain: factDomain,
    questionZhHant: z.string().min(1).max(300),
    questionEn: z.string().min(1).max(300),
    reason: z.string().min(1).max(300),
  })).max(20),
});

export const cloudExtractionRequestSchema = z.object({
  maskedText: z.string().trim().min(20).max(30_000),
  subjectRole: z.enum(["patient", "caregiver"]),
  language: z.enum(["zh-Hant", "en", "mixed"]),
  cloudUseApproved: z.literal(true),
}).strict();

export type CloudExtractionRequest = z.input<typeof cloudExtractionRequestSchema>;

export class CloudExtractionError extends Error {
  readonly code: "CLOUD_TIMEOUT" | "CLOUD_MODEL_ERROR" | "CLOUD_OUTPUT_TRUNCATED" | "CLOUD_INVALID_DRAFT";
  readonly model: string;

  constructor(message: string, code: CloudExtractionError["code"], model: string) {
    super(message);
    this.name = "CloudExtractionError";
    this.code = code;
    this.model = model;
  }
}

function extractionSystemPrompt(language: CloudExtractionRequest["language"], role: CloudExtractionRequest["subjectRole"]): string {
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
  ].join("\n");
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  return JSON.parse(withoutFence);
}

export async function extractProfileInCloud(
  input: CloudExtractionRequest,
  fetcher: typeof fetch = fetch,
  requestSignal?: AbortSignal,
  options: { onProgress?: (progress: CloudExtractionProgress) => void } = {},
): Promise<{ draft: ProfileDraft; model: string; reportedModel: string | null; transport: OllamaTransport; remote: true }> {
  const parsedInput = cloudExtractionRequestSchema.parse(input);
  const endpoint = resolveOllamaEndpoint();
  const model = validatedCloudModel();
  const timeoutSignal = AbortSignal.timeout(cloudExtractionTimeoutMs);
  const signal = requestSignal ? AbortSignal.any([requestSignal, timeoutSignal]) : timeoutSignal;
  const timeoutMessage = `The cloud model did not finish before the ${Math.round(cloudExtractionTimeoutMs / 1_000)}-second limit.`;
  let response: Response;
  try {
    response = await fetcher(endpoint.chatUrl, {
      method: "POST",
      headers: ollamaRequestHeaders(endpoint),
      body: JSON.stringify({
        model,
        // Streamed chunks let the route answer before short function limits;
        // the draft is still validated only once the full text has arrived.
        stream: true,
        think: false,
        format: "json",
        options: { temperature: 0.1, num_predict: 3072 },
        messages: [
          { role: "system", content: extractionSystemPrompt(parsedInput.language, parsedInput.subjectRole) },
          { role: "user", content: parsedInput.maskedText },
        ],
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new CloudExtractionError(timeoutMessage, "CLOUD_TIMEOUT", model);
    }
    throw new CloudExtractionError("The Ollama cloud connection failed.", "CLOUD_MODEL_ERROR", model);
  }
  if (!response.ok) {
    throw new CloudExtractionError(`Ollama cloud returned HTTP ${response.status}.`, "CLOUD_MODEL_ERROR", model);
  }

  let extracted: z.infer<typeof modelExtractionSchema>;
  let reportedModel: string | null = null;
  try {
    let payload: Awaited<ReturnType<typeof readOllamaChatContent>>;
    try {
      payload = await readOllamaChatContent(response, options.onProgress);
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new CloudExtractionError(timeoutMessage, "CLOUD_TIMEOUT", model);
      }
      throw error;
    }
    reportedModel = payload.model ?? null;
    if (payload.doneReason === "length") {
      throw new CloudExtractionError("The cloud response was cut off before the structured draft was complete. Please retry.", "CLOUD_OUTPUT_TRUNCATED", model);
    }
    extracted = modelExtractionSchema.parse(parseJsonContent(payload.content));
  } catch (error) {
    if (error instanceof CloudExtractionError) throw error;
    throw new CloudExtractionError("The cloud response could not be validated as a safe structured draft. Please retry.", "CLOUD_INVALID_DRAFT", model);
  }
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
  return { draft, model, reportedModel, transport: endpoint.transport, remote: true };
}
