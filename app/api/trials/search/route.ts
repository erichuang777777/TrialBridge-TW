import { trialSearchRequestSchema } from "@/lib/trials/schema";
import { searchTrialCatalog } from "@/lib/trials/index/catalog";
import { createRegistryQueryPlan } from "@/lib/trials/queryBridge";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
};

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const limit = consumeRateLimit(request, { bucket: "trial-search", limit: 60, windowMs: 5 * 60_000 });
  if (!limit.allowed) return withCors(rateLimitResponse(limit));
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(Response.json({ error: "Request body must be valid JSON." }, { status: 400 }));
  }

  const parsed = trialSearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return withCors(Response.json({
      error: "Invalid trial search request.",
      fields: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    }, { status: 400 }));
  }

  const queryPlan = createRegistryQueryPlan(parsed.data.condition);
  const result = await searchTrialCatalog(parsed.data, queryPlan.registryConditions, { signal: request.signal });
  const status = result.sources.length === 0 ? 503 : 200;
  return withCors(Response.json({
    ...result,
    queryPlan,
    searchOrder: ["taiwan", "asia", "world", "unknown"],
    disclaimer: "Trial registries describe research plans. They do not prove benefit or determine final eligibility.",
  }, {
    status,
    headers: { "Cache-Control": "no-store" },
  }));
}
