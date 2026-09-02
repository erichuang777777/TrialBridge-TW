import { requiredCloudModel, validatedCloudModel } from "../../../lib/llm/cloud.ts";
import { validatedLoopbackBaseUrl } from "../../../lib/llm/ollama.ts";
import { inspectTfdaSnapshotDeployment } from "../../../lib/trials/tfdaSnapshot.ts";
import { getWebMcpOriginTrialDeploymentState } from "../../../lib/webmcp/originTrial.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const originTrial = getWebMcpOriginTrialDeploymentState();
  const tfdaSnapshot = await inspectTfdaSnapshotDeployment();
  let configuration: "ready" | "invalid" = "ready";
  try {
    validatedCloudModel();
    validatedLoopbackBaseUrl();
  } catch {
    configuration = "invalid";
  }
  if (originTrial.status === "misconfigured") configuration = "invalid";
  if (["expired", "missing", "misconfigured"].includes(tfdaSnapshot.status)) configuration = "invalid";

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
      tfdaSnapshot,
      webmcp: "progressive-enhancement",
      originTrial: {
        status: originTrial.status,
        tokenConfigured: originTrial.tokenConfigured,
        tokenShape: originTrial.tokenShape,
        originEligible: originTrial.originEligible,
        delivery: originTrial.delivery,
        browserValidation: originTrial.browserValidation,
        containsToken: originTrial.containsToken,
      },
    },
  }, {
    status: configuration === "ready" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
