import { confirmedProfileSchema } from "@/lib/profile/schema";
import { matchConfirmedProfile } from "@/lib/matching/engine";
import { z } from "zod";

export const runtime = "nodejs";
const requestSchema = z.object({ profile: confirmedProfileSchema }).strict();

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "A valid patient-confirmed profile is required." }, { status: 400 });
  try {
    const result = await matchConfirmedProfile(parsed.data.profile);
    return Response.json({ ...result, disclaimer: "This is a source-traceable navigation aid, not proof of benefit or a final eligibility decision." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Matching failed." }, { status: 422 });
  }
}
