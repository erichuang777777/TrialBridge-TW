import { requiredCloudModel, validatedCloudModel } from "@/lib/llm/cloud";
import { validatedLoopbackBaseUrl } from "@/lib/llm/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let configuration: "ready" | "invalid" = "ready";
  try {
    validatedCloudModel();
    validatedLoopbackBaseUrl();
  } catch {
    configuration = "invalid";
  }

  return Response.json({
    status: configuration === "ready" ? "ok" : "degraded",
    service: "TrialBridge TW",
    version: "0.1.0",
    checks: {
      configuration,
      cloudModel: requiredCloudModel,
      inference: "remote-cloud-only",
      proxyBoundary: "loopback-server-proxy",
      persistence: "none",
      webmcp: "progressive-enhancement",
      originTrialTokenConfigured: Boolean(process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN?.trim()),
    },
  }, {
    status: configuration === "ready" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
