import { NextResponse } from "next/server";
import { getSiteConfig, siteDescription, siteName } from "../../../lib/site/metadata.ts";
import { webMcpImperativeContractCore } from "../../../lib/webmcp/toolContractCore.ts";

export const dynamic = "force-static";

export function GET() {
  const site = getSiteConfig();
  return NextResponse.json({
    schemaVersion: "1.0",
    name: siteName,
    description: siteDescription,
    origin: site.origin,
    api: {
      interface: "document.modelContext",
      discovery: "getTools",
      invocation: "executeTool",
      browserRequirement: "Chrome 146+ with WebMCP enabled; production Origin Trial where available",
    },
    tools: [
      {
        name: webMcpImperativeContractCore.search_public_cancer_trials.name,
        description: webMcpImperativeContractCore.search_public_cancer_trials.description,
        location: `${site.origin}/trials`,
        authority: "public read-only registry search",
      },
      {
        name: webMcpImperativeContractCore.trialbridge_method.name,
        description: webMcpImperativeContractCore.trialbridge_method.description,
        location: `${site.origin}/webmcp/quickstart`,
        authority: "public read-only method explanation",
      },
    ],
    humanControl: "Patient-context tools require visible consent and confirmation; no enrollment or outbound writes are exposed.",
  }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
