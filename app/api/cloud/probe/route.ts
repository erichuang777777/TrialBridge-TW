import { CloudProbeError, probeCloudModel } from "@/lib/llm/cloudProbe";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rateLimit";
import { hasDeclaredRequestBody } from "@/lib/security/requestBody";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (hasDeclaredRequestBody(request)) return Response.json({ error: "The cloud probe accepts no request body.", code: "PROBE_INPUT_FORBIDDEN" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const limit = consumeRateLimit(request, { bucket: "cloud-probe", limit: 3, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  try {
    return Response.json(await probeCloudModel({ signal: request.signal }), {
      headers: { "Cache-Control": "no-store", "X-TrialBridge-Processing": "ollama-cloud-probe" },
    });
  } catch (error) {
    if (error instanceof CloudProbeError) {
      return Response.json({ error: error.message, code: error.code }, {
        status: error.code === "CLOUD_PROBE_TIMEOUT" ? 504 : 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return Response.json({ error: "The cloud probe failed.", code: "CLOUD_PROBE_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
