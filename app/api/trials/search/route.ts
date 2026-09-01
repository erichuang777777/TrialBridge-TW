import { trialSearchRequestSchema } from "@/lib/trials/schema";
import { searchTrialRegistries } from "@/lib/trials/search";
import { createRegistryQueryPlan } from "@/lib/trials/queryBridge";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = consumeRateLimit(request, { bucket: "trial-search", limit: 60, windowMs: 5 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = trialSearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({
      error: "Invalid trial search request.",
      fields: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    }, { status: 400 });
  }

  const queryPlan = createRegistryQueryPlan(parsed.data.condition);
  const result = await searchTrialRegistries(parsed.data, undefined, queryPlan.registryConditions, { signal: request.signal });
  const status = result.sources.length === 0 ? 503 : 200;
  return Response.json({
    ...result,
    queryPlan,
    searchOrder: ["taiwan", "asia", "world", "unknown"],
    disclaimer: "Trial registries describe research plans. They do not prove benefit or determine final eligibility.",
  }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
