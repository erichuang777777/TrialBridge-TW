import { cloudExtractionRequestSchema, CloudExtractionError, extractProfileInCloud } from "@/lib/llm/extraction";
import { createCloudExtractionReceipt } from "@/lib/llm/extractionReceipt";
import { hasDirectIdentifiers } from "@/lib/privacy/mask";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = consumeRateLimit(request, { bucket: "cloud-extract", limit: 8, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = cloudExtractionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Explicit cloud approval is required for extraction." }, { status: 403 });
  }
  if (hasDirectIdentifiers(parsed.data.maskedText)) {
    return Response.json({
      error: "Direct identifiers are still present. Return to the browser masking review before cloud extraction.",
    }, { status: 422 });
  }

  const startedAtMs = Date.now();
  try {
    const result = await extractProfileInCloud(parsed.data, fetch, request.signal);
    const receipt = createCloudExtractionReceipt({
      status: "completed",
      requestedModel: result.model,
      reportedModel: result.reportedModel,
      startedAtMs,
      endedAtMs: Date.now(),
    });
    return Response.json({ ...result, receipt, processing: "ollama-cloud", persisted: false }, {
      headers: { "Cache-Control": "no-store", "X-TrialBridge-Processing": "ollama-cloud" },
    });
  } catch (error) {
    if (error instanceof CloudExtractionError) {
      const receipt = createCloudExtractionReceipt({
        status: "failed",
        requestedModel: error.model,
        startedAtMs,
        endedAtMs: Date.now(),
        failureCode: error.code,
      });
      return Response.json({ error: error.message, code: error.code, model: error.model, receipt }, { status: 503 });
    }
    return Response.json({ error: "Cloud extraction failed or returned an invalid draft.", code: "CLOUD_MODEL_ERROR" }, { status: 503 });
  }
}
