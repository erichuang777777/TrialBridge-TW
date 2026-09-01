import { webMcpJudgeBundle } from "@/lib/webmcp/judgeBundle";

export const dynamic = "force-static";

export function GET() {
  return Response.json(webMcpJudgeBundle, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Disposition": `inline; filename="trialbridge-webmcp-judge-bundle-${webMcpJudgeBundle.auditedAt}.json"`,
    },
  });
}
