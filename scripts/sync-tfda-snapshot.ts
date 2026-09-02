import { loadOfficialTfdaRecords } from "../lib/trials/adapters/tfda.ts";
import { writeTfdaSnapshotFile } from "../lib/trials/tfdaSnapshot.ts";

function failureCode(error: unknown): "CONFIGURATION_INVALID" | "UPSTREAM_UNAVAILABLE" | "UPSTREAM_DATA_INVALID" | "SNAPSHOT_WRITE_FAILED" {
  const message = error instanceof Error ? error.message : "";
  if (/TFDA_SNAPSHOT_PATH/.test(message)) return "CONFIGURATION_INVALID";
  if (/TFDA returned HTTP/.test(message)) return "UPSTREAM_UNAVAILABLE";
  if (/archive|JSON|record|Zod|parse|Unexpected token|exceeds/i.test(message)) return "UPSTREAM_DATA_INVALID";
  return "SNAPSHOT_WRITE_FAILED";
}

try {
  const destination = process.env.TFDA_SNAPSHOT_PATH;
  if (!destination) throw new Error("TFDA_SNAPSHOT_PATH is required for scheduled ingestion.");
  const records = await loadOfficialTfdaRecords();
  const manifest = await writeTfdaSnapshotFile(destination, records);
  console.log(JSON.stringify({
    ok: true,
    registry: manifest.registry,
    generatedAt: manifest.generatedAt,
    recordCount: manifest.recordCount,
    recordsDigestSha256: manifest.recordsDigestSha256,
    snapshotBytes: manifest.snapshotBytes,
    containsPatientData: manifest.containsPatientData,
    pathConfigured: true,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    registry: "TFDA",
    code: failureCode(error),
    containsPatientData: false,
    pathConfigured: Boolean(process.env.TFDA_SNAPSHOT_PATH),
  }, null, 2));
  process.exitCode = 1;
}
