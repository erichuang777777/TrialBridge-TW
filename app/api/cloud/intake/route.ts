import { answerGuidedIntake, guidedIntakeRequestSchema } from "@/lib/llm/intake";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = consumeRateLimit(request, { bucket: "cloud-intake", limit: 30, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = guidedIntakeRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "The guided message is invalid or still contains direct identifiers." }, { status: 422 });
  try {
    return Response.json(await answerGuidedIntake(parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The cloud intake assistant is unavailable. You can continue in the middle panel." }, { status: 503 });
  }
}
