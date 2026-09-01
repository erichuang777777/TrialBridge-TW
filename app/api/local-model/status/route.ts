import { localOllamaStatus } from "@/lib/llm/ollama";

export const runtime = "nodejs";

export async function GET() {
  const status = await localOllamaStatus();
  return Response.json({ ...status, processing: "loopback-only" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
