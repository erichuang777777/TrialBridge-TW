import { extractProfileLocallyWithMetadata, LocalExtractionError, localExtractionRequestSchema } from "@/lib/llm/ollama";
import { hasDirectIdentifiers } from "@/lib/privacy/mask";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = localExtractionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid local extraction request." }, { status: 400 });
  }
  if (hasDirectIdentifiers(parsed.data.maskedText)) {
    return Response.json({
      error: "Direct identifiers are still present. Return to the browser masking review before extraction.",
    }, { status: 422 });
  }

  try {
    const result = await extractProfileLocallyWithMetadata(parsed.data, fetch, request.signal);
    return Response.json({ ...result, processing: "local-ollama", persisted: false }, {
      headers: { "Cache-Control": "no-store", "X-TrialBridge-Processing": "local-ollama" },
    });
  } catch (error) {
    if (error instanceof LocalExtractionError) {
      return Response.json({ error: error.message, code: error.code, model: error.model }, { status: 503 });
    }
    return Response.json({ error: "Local extraction failed or returned an invalid draft.", code: "LOCAL_MODEL_ERROR" }, { status: 503 });
  }
}
