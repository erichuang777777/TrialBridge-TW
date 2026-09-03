import { getTrialIndexAccessState, tfdaLiveFallbackEnabled } from "@/lib/trials/index/catalog";
import { getTrialIndexStore } from "@/lib/trials/index/store";
import { registryIntegrationCatalog } from "@/lib/trials/sourceCatalog";
import { inspectTfdaSnapshotDeployment } from "@/lib/trials/tfdaSnapshot";
import { inspectNciTerminology } from "@/lib/trials/terminology/nci";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const index = await getTrialIndexStore().health();
    const nciTerminology = await inspectNciTerminology();
    const integrations = registryIntegrationCatalog().map((source) => source.id === "ncit" && nciTerminology.status === "ready" ? { ...source, state: "active" as const } : source);
    return Response.json({
      generatedAt: new Date().toISOString(), index,
      indexAccess: getTrialIndexAccessState(),
      liveFallback: { tfda: tfdaLiveFallbackEnabled(), clinicalTrialsGov: true },
      tfdaSnapshot: await inspectTfdaSnapshotDeployment(),
      nciTerminology,
      integrations,
      schedule: process.env.TRIAL_INDEX_SYNC_SCHEDULE ?? "Daily 02:00 Asia/Taipei (deployment scheduler required)",
      privacy: "Public registry data only. Patient notes and confirmed profiles are never stored in this index.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Trial index health is unavailable.", generatedAt: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
