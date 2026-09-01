import { trialSearchRequestSchema } from "@/lib/trials/schema";
import { searchTrialRegistries } from "@/lib/trials/search";

export const runtime = "nodejs";

export async function POST(request: Request) {
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

  const result = await searchTrialRegistries(parsed.data);
  const status = result.sources.length === 0 ? 503 : 200;
  return Response.json({
    ...result,
    searchOrder: ["taiwan", "asia", "world", "unknown"],
    disclaimer: "Trial registries describe research plans. They do not prove benefit or determine final eligibility.",
  }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
