import { trialSearchRequestSchema } from "@/lib/trials/schema";
import { searchTrialCatalog } from "@/lib/trials/index/catalog";
import { createRegistryQueryPlan } from "@/lib/trials/queryBridge";
import { consumeRateLimit, rateLimitResponse } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

const corsHeaders = (request?: Request) => {
  const origin = request?.headers.get("origin");
  return {
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
  ...(origin ? { "Access-Control-Allow-Credentials": "true" } : {}),
};
};

function withCors(response: Response, request?: Request) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(request)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const limit = consumeRateLimit(request, { bucket: "trial-search", limit: 60, windowMs: 5 * 60_000 });
  if (!limit.allowed) return withCors(rateLimitResponse(limit), request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(Response.json({ error: "Request body must be valid JSON." }, { status: 400 }), request);
  }

  const parsed = trialSearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return withCors(Response.json({
      error: "Invalid trial search request.",
      fields: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    }, { status: 400 }), request);
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
  }), request);
}

// Some agent inspectors probe a declarative form's endpoint with GET before
// invoking it. Return the same bounded public search instead of framework 405.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const condition = url.searchParams.get("condition")?.trim() || "cancer";
  const includeNotOpen = url.searchParams.get("includeNotOpen") !== "false";
  const pageSize = Math.min(Number(url.searchParams.get("pageSize") || 5) || 5, 5);
  const input = trialSearchRequestSchema.safeParse({ condition, includeNotOpen, pageSize });
  if (!input.success) return withCors(Response.json({ error: "Invalid trial search condition." }, { status: 400 }), request);
  const queryPlan = createRegistryQueryPlan(input.data.condition);
  const result = await searchTrialCatalog(input.data, queryPlan.registryConditions, { signal: request.signal });
  return withCors(Response.json({ ...result, queryPlan, searchOrder: ["taiwan", "asia", "world", "unknown"], disclaimer: "Trial registries describe research plans. They do not prove benefit or determine final eligibility." }), request);
}
