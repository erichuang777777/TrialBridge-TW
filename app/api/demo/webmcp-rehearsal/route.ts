import { z } from "zod";
import { runLiveAgentRehearsal } from "@/lib/webmcp/liveRehearsal";
import { liveAgentRehearsalScenarioIds } from "@/lib/webmcp/liveRehearsalContract";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

const requestSchema = z.object({ scenarioId: z.enum(liveAgentRehearsalScenarioIds) }).strict();

export async function POST(request: Request) {
  const limit = consumeRateLimit(request, { bucket: "cloud-probe", limit: 3, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  let rawBody: string;
  try { rawBody = await request.text(); } catch { return Response.json({ error: "Request body could not be read.", code: "REHEARSAL_INPUT_INVALID" }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  if (rawBody.length > 256) return Response.json({ error: "Request body is too large.", code: "REHEARSAL_INPUT_TOO_LARGE" }, { status: 413, headers: { "Cache-Control": "no-store" } });
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return Response.json({ error: "Request body must be valid JSON.", code: "REHEARSAL_INPUT_INVALID" }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose one fixed rehearsal scenario.", code: "REHEARSAL_SCENARIO_INVALID" }, { status: 422, headers: { "Cache-Control": "no-store" } });
  try {
    const receipt = await runLiveAgentRehearsal(parsed.data.scenarioId, { signal: request.signal });
    return Response.json(receipt, {
      status: receipt.state === "unavailable" ? 503 : 200,
      headers: { "Cache-Control": "no-store", "X-TrialBridge-Processing": "webmcp-live-agent-rehearsal" },
    });
  } catch (error) {
    if (request.signal.aborted) throw request.signal.reason;
    return Response.json({ error: "The live agent rehearsal is unavailable.", code: "REHEARSAL_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
