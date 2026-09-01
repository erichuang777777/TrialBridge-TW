import { runCompetitionPreflight } from "@/lib/demo/preflight";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rateLimit";
import { hasDeclaredRequestBody } from "@/lib/security/requestBody";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (hasDeclaredRequestBody(request)) return Response.json({ error: "The demo preflight accepts no request body.", code: "PREFLIGHT_INPUT_FORBIDDEN" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const limit = consumeRateLimit(request, { bucket: "cloud-probe", limit: 3, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  try {
    const receipt = await runCompetitionPreflight({ signal: request.signal });
    return Response.json(receipt, {
      status: receipt.status === "unavailable" ? 503 : 200,
      headers: { "Cache-Control": "no-store", "X-TrialBridge-Processing": "competition-preflight" },
    });
  } catch (error) {
    if (request.signal.aborted) throw error;
    return Response.json({ error: "The competition preflight could not finish.", code: "PREFLIGHT_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
