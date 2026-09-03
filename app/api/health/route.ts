import { requiredCloudModel, validatedCloudModel } from "../../../lib/llm/cloud.ts";
import { validatedLoopbackBaseUrl } from "../../../lib/llm/ollama.ts";
import { inspectTfdaSnapshotDeployment } from "../../../lib/trials/tfdaSnapshot.ts";
import { getWebMcpOriginTrialDeploymentState } from "../../../lib/webmcp/originTrial.ts";
import { getTrialIndexStore } from "../../../lib/trials/index/store.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const originTrial = getWebMcpOriginTrialDeploymentState();
  const tfdaSnapshot = await inspectTfdaSnapshotDeployment();
  let trialIndex: Awaited<ReturnType<ReturnType<typeof getTrialIndexStore>["health"]>> | { status: "unavailable"; containsPatientData: false; message: string };
  let configuration: "ready" | "invalid" = "ready";
  try {
    validatedCloudModel();
    validatedLoopbackBaseUrl();
  } catch {
    configuration = "invalid";
  }
  try {
    trialIndex = await getTrialIndexStore().health();
  } catch {
    trialIndex = { status: "unavailable", containsPatientData: false, message: "Public trial index health is temporarily unavailable." };
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
      patientPersistence: "none",
      persistence: "public_registry_index_only",
      trialIndex,
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
