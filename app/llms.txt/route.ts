import { createLlmsTxt } from "@/lib/webmcp/agentDiscovery";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const content = createLlmsTxt(new URL(request.url).origin);
  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
