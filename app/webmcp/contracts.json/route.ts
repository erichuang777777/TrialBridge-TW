import { webMcpToolContractBundle } from "@/lib/webmcp/toolContractCatalog";

export const dynamic = "force-static";

export function GET() {
  return Response.json(webMcpToolContractBundle, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Disposition": `inline; filename="trialbridge-webmcp-tool-contracts-${webMcpToolContractBundle.auditedAt}.json"`,
    },
  });
}
