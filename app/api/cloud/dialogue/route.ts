import { answerConfirmedDialogue, cloudDialogueRequestSchema } from "@/lib/llm/cloud";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = cloudDialogueRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Only an explicitly approved, confirmed summary can use cloud dialogue." }, { status: 403 });
  try {
    return Response.json(await answerConfirmedDialogue(parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Cloud dialogue is unavailable or returned an invalid response." }, { status: 503 });
  }
}
