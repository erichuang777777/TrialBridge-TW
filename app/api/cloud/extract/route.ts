import { cloudExtractionRequestSchema, CloudExtractionError, extractProfileInCloud, type CloudExtractionProgress } from "@/lib/llm/extraction";
import { createCloudExtractionReceipt } from "@/lib/llm/extractionReceipt";
import { resolveOllamaTransport } from "@/lib/llm/ollama";
import { hasDirectIdentifiers } from "@/lib/privacy/mask";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store", "X-TrialBridge-Processing": "ollama-cloud" };

type ExtractionOutcome =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

async function runExtraction(data: ReturnType<typeof cloudExtractionRequestSchema.parse>, signal: AbortSignal, onProgress?: (progress: CloudExtractionProgress) => void): Promise<ExtractionOutcome> {
  const startedAtMs = Date.now();
  try {
    const result = await extractProfileInCloud(data, fetch, signal, { onProgress });
    const receipt = createCloudExtractionReceipt({
      status: "completed",
      requestedModel: result.model,
      reportedModel: result.reportedModel,
      transport: result.transport,
      startedAtMs,
      endedAtMs: Date.now(),
    });
    return { ok: true, body: { ...result, receipt, processing: "ollama-cloud", persisted: false } };
  } catch (error) {
    if (error instanceof CloudExtractionError) {
      const receipt = createCloudExtractionReceipt({
        status: "failed",
        requestedModel: error.model,
        transport: safeTransport(),
        startedAtMs,
        endedAtMs: Date.now(),
        failureCode: error.code,
      });
      return { ok: false, status: 503, body: { error: error.message, code: error.code, model: error.model, receipt } };
    }
    return { ok: false, status: 503, body: { error: "Cloud extraction failed or returned an invalid draft.", code: "CLOUD_MODEL_ERROR" } };
  }
}

function safeTransport() {
  try {
    return resolveOllamaTransport();
  } catch {
    return undefined;
  }
}

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

  const wantsEventStream = request.headers.get("accept")?.includes("text/event-stream") ?? false;
  if (!wantsEventStream) {
    const outcome = await runExtraction(parsed.data, request.signal);
    return Response.json(outcome.body, { status: outcome.ok ? 200 : outcome.status, headers: noStore });
  }

  // Server-sent events: headers go out immediately, progress events carry only a
  // character count, and the validated draft (or bounded failure) arrives last.
  // This keeps the response alive on hosts with short synchronous limits.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };
      send("accepted", { processing: "ollama-cloud", persisted: false });
      let lastProgressAt = 0;
      let lastCharacters = 0;
      const outcome = await runExtraction(parsed.data, request.signal, (progress) => {
        const now = Date.now();
        if (progress.characters - lastCharacters < 48 && now - lastProgressAt < 400) return;
        lastProgressAt = now;
        lastCharacters = progress.characters;
        send("progress", progress);
      });
      send(outcome.ok ? "result" : "failure", outcome.ok ? outcome.body : { ...outcome.body, status: outcome.status });
      closed = true;
      controller.close();
    },
    cancel() {
      // The client went away; the request signal already aborts the upstream call.
    },
  });
  return new Response(stream, {
    headers: {
      ...noStore,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
