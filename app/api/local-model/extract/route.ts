import { extractProfileLocally, localExtractionRequestSchema } from "@/lib/llm/ollama";
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
    const draft = await extractProfileLocally(parsed.data);
    return Response.json({ draft, processing: "local-ollama", persisted: false }, {
      headers: { "Cache-Control": "no-store", "X-TrialBridge-Processing": "local-ollama" },
    });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Local Ollama returned")
      ? error.message
      : "Local extraction failed or returned an invalid draft.";
    return Response.json({ error: message }, { status: 503 });
  }
}
