import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { TFDA_DATASET_PAGE, TFDA_DATASET_URL, tfdaRecordSchema, type TfdaRecord } from "./tfdaRecord.ts";
import type { SnapshotRead } from "./snapshotCache.ts";

export const tfdaSnapshotEnvironmentKey = "TFDA_SNAPSHOT_PATH" as const;
export const tfdaSnapshotFreshMs = 24 * 60 * 60 * 1_000;
export const tfdaSnapshotMaxAgeMs = 7 * 24 * 60 * 60 * 1_000;
export const maxTfdaSnapshotBytes = 300 * 1024 * 1024;

const digestPattern = /^[a-f0-9]{64}$/;
const tfdaSnapshotManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  registry: z.literal("TFDA"),
  sourceUrl: z.literal(TFDA_DATASET_URL),
  datasetPage: z.literal(TFDA_DATASET_PAGE),
  generatedAt: z.string().datetime(),
  recordCount: z.number().int().positive(),
  recordsDigestSha256: z.string().regex(digestPattern),
  snapshotBytes: z.number().int().positive().max(maxTfdaSnapshotBytes),
  containsPatientData: z.literal(false),
}).strict();

const tfdaSnapshotArtifactSchema = tfdaSnapshotManifestSchema.omit({ snapshotBytes: true }).extend({
  records: z.array(tfdaRecordSchema).min(1),
}).strict();

export type TfdaSnapshotManifest = z.infer<typeof tfdaSnapshotManifestSchema>;

type TfdaSnapshotEnvironment = Partial<Record<typeof tfdaSnapshotEnvironmentKey, string>>;

export type TfdaSnapshotDeploymentState = {
  status: "request_time_fallback" | "fresh" | "stale" | "expired" | "missing" | "misconfigured";
  configured: boolean;
  storage: "process_memory" | "scheduled_file";
  generatedAt?: string;
  recordCount?: number;
  containsPatientData: false;
  reason?: "INVALID_PATH" | "SNAPSHOT_MISSING" | "SNAPSHOT_INVALID" | "SNAPSHOT_EXPIRED";
};

function recordsDigest(recordsJson: string): string {
  return createHash("sha256").update(recordsJson).digest("hex");
}

export function resolveTfdaSnapshotPath(rawValue: string | undefined): string | undefined {
  const value = rawValue?.trim();
  if (!value) return undefined;
  if (value !== rawValue || !path.isAbsolute(value) || path.extname(value).toLocaleLowerCase("en") !== ".json") {
    throw new Error("TFDA_SNAPSHOT_PATH must be one absolute .json file path without surrounding whitespace.");
  }
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) throw new Error("TFDA_SNAPSHOT_PATH cannot be a filesystem root.");
  return resolved;
}

export function tfdaSnapshotManifestPath(snapshotPath: string): string {
  return `${snapshotPath}.manifest.json`;
}

function classifySnapshotAge(generatedAt: string, nowMs: number): "fresh_cache" | "stale_cache" {
  const generatedAtMs = Date.parse(generatedAt);
  const ageMs = nowMs - generatedAtMs;
  if (!Number.isFinite(generatedAtMs) || ageMs < -5 * 60 * 1_000) throw new Error("TFDA snapshot generation time is invalid or in the future");
  if (ageMs > tfdaSnapshotMaxAgeMs) throw new Error("TFDA scheduled snapshot is older than seven days");
  return ageMs <= tfdaSnapshotFreshMs ? "fresh_cache" : "stale_cache";
}

async function atomicWrite(destination: string, content: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, destination);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

export async function writeTfdaSnapshotFile(
  rawPath: string,
  rawRecords: TfdaRecord[],
  generatedAt = new Date().toISOString(),
): Promise<TfdaSnapshotManifest> {
  const snapshotPath = resolveTfdaSnapshotPath(rawPath);
  if (!snapshotPath) throw new Error("TFDA_SNAPSHOT_PATH is required for scheduled ingestion.");
  const records = z.array(tfdaRecordSchema).min(1).parse(rawRecords);
  const recordsJson = JSON.stringify(records);
  const artifact = tfdaSnapshotArtifactSchema.parse({
    schemaVersion: "1.0",
    registry: "TFDA",
    sourceUrl: TFDA_DATASET_URL,
    datasetPage: TFDA_DATASET_PAGE,
    generatedAt,
    recordCount: records.length,
    recordsDigestSha256: recordsDigest(recordsJson),
    containsPatientData: false,
    records,
  });
  const serialized = JSON.stringify(artifact);
  const snapshotBytes = Buffer.byteLength(serialized, "utf8");
  if (snapshotBytes > maxTfdaSnapshotBytes) throw new Error("TFDA scheduled snapshot exceeds the configured safety limit");
  const manifest = tfdaSnapshotManifestSchema.parse({
    schemaVersion: artifact.schemaVersion,
    registry: artifact.registry,
    sourceUrl: artifact.sourceUrl,
    datasetPage: artifact.datasetPage,
    generatedAt: artifact.generatedAt,
    recordCount: artifact.recordCount,
    recordsDigestSha256: artifact.recordsDigestSha256,
    snapshotBytes,
    containsPatientData: artifact.containsPatientData,
  });
  await atomicWrite(snapshotPath, serialized);
  await atomicWrite(tfdaSnapshotManifestPath(snapshotPath), JSON.stringify(manifest));
  return manifest;
}

type CachedSnapshot = {
  modifiedAtMs: number;
  size: number;
  artifact: z.infer<typeof tfdaSnapshotArtifactSchema>;
};
const scheduledSnapshotCache = new Map<string, CachedSnapshot>();

async function readValidatedTfdaSnapshot(snapshotPath: string): Promise<CachedSnapshot> {
  const fileStat = await stat(snapshotPath);
  if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > maxTfdaSnapshotBytes) throw new Error("TFDA scheduled snapshot file size is invalid");
  let cached = scheduledSnapshotCache.get(snapshotPath);
  if (!cached || cached.modifiedAtMs !== fileStat.mtimeMs || cached.size !== fileStat.size) {
    const artifact = tfdaSnapshotArtifactSchema.parse(JSON.parse(await readFile(snapshotPath, "utf8")));
    const digest = recordsDigest(JSON.stringify(artifact.records));
    if (digest !== artifact.recordsDigestSha256 || artifact.recordCount !== artifact.records.length) {
      throw new Error("TFDA scheduled snapshot digest or record count is invalid");
    }
    cached = { modifiedAtMs: fileStat.mtimeMs, size: fileStat.size, artifact };
    scheduledSnapshotCache.set(snapshotPath, cached);
  }
  return cached;
}

async function readMatchingTfdaManifest(snapshotPath: string, snapshot: CachedSnapshot): Promise<TfdaSnapshotManifest> {
  const manifest = tfdaSnapshotManifestSchema.parse(JSON.parse(await readFile(tfdaSnapshotManifestPath(snapshotPath), "utf8")));
  const artifact = snapshot.artifact;
  if (
    manifest.snapshotBytes !== snapshot.size ||
    manifest.schemaVersion !== artifact.schemaVersion ||
    manifest.registry !== artifact.registry ||
    manifest.sourceUrl !== artifact.sourceUrl ||
    manifest.datasetPage !== artifact.datasetPage ||
    manifest.generatedAt !== artifact.generatedAt ||
    manifest.recordCount !== artifact.recordCount ||
    manifest.recordsDigestSha256 !== artifact.recordsDigestSha256 ||
    manifest.containsPatientData !== artifact.containsPatientData
  ) throw new Error("TFDA snapshot manifest does not match the validated snapshot");
  return manifest;
}

export async function readTfdaSnapshotFile(
  rawPath: string,
  nowMs = Date.now(),
): Promise<SnapshotRead<TfdaRecord[]>> {
  const snapshotPath = resolveTfdaSnapshotPath(rawPath);
  if (!snapshotPath) throw new Error("TFDA_SNAPSHOT_PATH is required for scheduled loading.");
  const cached = await readValidatedTfdaSnapshot(snapshotPath);
  await readMatchingTfdaManifest(snapshotPath, cached);
  return {
    value: cached.artifact.records,
    mode: classifySnapshotAge(cached.artifact.generatedAt, nowMs),
    loadedAt: cached.artifact.generatedAt,
    storage: "scheduled_file",
  };
}

export async function inspectTfdaSnapshotDeployment(
  environment: TfdaSnapshotEnvironment = process.env as TfdaSnapshotEnvironment,
  nowMs = Date.now(),
): Promise<TfdaSnapshotDeploymentState> {
  let snapshotPath: string | undefined;
  try {
    snapshotPath = resolveTfdaSnapshotPath(environment[tfdaSnapshotEnvironmentKey]);
  } catch {
    return { status: "misconfigured", configured: true, storage: "scheduled_file", containsPatientData: false, reason: "INVALID_PATH" };
  }
  if (!snapshotPath) return { status: "request_time_fallback", configured: false, storage: "process_memory", containsPatientData: false };
  try {
    const snapshot = await readTfdaSnapshotFile(snapshotPath, nowMs);
    return { status: snapshot.mode === "fresh_cache" ? "fresh" : "stale", configured: true, storage: "scheduled_file", generatedAt: snapshot.loadedAt, recordCount: snapshot.value.length, containsPatientData: false };
  } catch (error) {
    if (error instanceof Error && /older than seven days/.test(error.message)) {
      return { status: "expired", configured: true, storage: "scheduled_file", containsPatientData: false, reason: "SNAPSHOT_EXPIRED" };
    }
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return { status: missing ? "missing" : "misconfigured", configured: true, storage: "scheduled_file", containsPatientData: false, reason: missing ? "SNAPSHOT_MISSING" : "SNAPSHOT_INVALID" };
  }
}
