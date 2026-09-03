import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rateLimit";
import { trialRevalidationRequestSchema } from "@/lib/trials/schema";
import { revalidateIndexedTrial } from "@/lib/trials/revalidation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = consumeRateLimit(request, { bucket: "trial-revalidation", limit: 30, windowMs: 5 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = trialRevalidationRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "A valid public TrialBridge canonical ID is required." }, { status: 400 });
  try {
    return Response.json(await revalidateIndexedTrial(parsed.data.canonicalId, fetch, request.signal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) throw request.signal.reason;
    return Response.json({ error: error instanceof Error && /HTTP \d{3}/.test(error.message) ? error.message : "Public trial revalidation is temporarily unavailable." }, { status: 502 });
  }
}
