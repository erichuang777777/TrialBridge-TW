import { createWebMcpAgentGuide } from "@/lib/webmcp/agentDiscovery";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const content = createWebMcpAgentGuide(new URL(request.url).origin);
  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      Link: `</llms.txt>; rel="describedby"`,
    },
  });
}
