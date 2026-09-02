import { strFromU8, unzipSync } from "fflate";
import { z } from "zod";
import { normalizedTrialSchema } from "../schema.ts";
import { waitForPromiseWithSignal } from "../../security/abort.ts";
import { cleanText, containsCjk, normalizeIdentifier, uniqueText } from "../text.ts";
import { StaleWhileRevalidateSnapshot, type SnapshotRead } from "../snapshotCache.ts";
import { readTfdaSnapshotFile, tfdaSnapshotFreshMs, tfdaSnapshotMaxAgeMs } from "../tfdaSnapshot.ts";
import { TFDA_DATASET_PAGE, TFDA_DATASET_URL, tfdaRecordSchema, type TfdaRecord } from "../tfdaRecord.ts";
import type {
  NormalizedTrial,
  RecruitmentCategory,
  TrialAdapterResult,
  TrialAdapterSearchOptions,
  TrialRegistryAdapter,
  TrialSearchInput,
} from "../types.ts";

export { TFDA_DATASET_PAGE, TFDA_DATASET_URL } from "../tfdaRecord.ts";
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_JSON_BYTES = 256 * 1024 * 1024;

export type { TfdaRecord } from "../tfdaRecord.ts";

function recruitmentCategory(status: string): RecruitmentCategory {
  const normalized = status.toLocaleLowerCase("zh-Hant");
  if (/招募中|執行中|進行中|recruiting/.test(normalized)) return "open";
  if (/尚未招募|未開始/.test(normalized)) return "opening_soon";
  if (/結束|終止|完成|停止|已關閉/.test(normalized)) return "not_open";
  return "unknown";
}

export function normalizeTfdaRecord(rawInput: unknown, retrievedAt: string): NormalizedTrial {
  const raw = tfdaRecordSchema.parse(rawInput);
  const rawProtocolId = cleanText(raw.臨床試驗計畫書編號) ?? cleanText(raw.TFDA收文號);
  if (!rawProtocolId) throw new Error("TFDA record has no usable identifier");
  const protocolId = normalizeIdentifier(rawProtocolId);
  const receiptId = cleanText(raw.TFDA收文號);
  const status = cleanText(raw.執行狀態) ?? "未提供";
  const category = recruitmentCategory(status);
  const title = cleanText(raw.臨床試驗計畫中文名稱) ?? protocolId;

  return normalizedTrialSchema.parse({
    canonicalId: `tfda:${protocolId.toLocaleLowerCase("en")}`,
    identifiers: uniqueText([protocolId, receiptId]).map(normalizeIdentifier),
    sources: [{
      registry: "TFDA",
      registryId: receiptId ?? protocolId,
      url: TFDA_DATASET_PAGE,
      retrievedAt,
      lastUpdated: cleanText(raw.資料更新時間),
      license: "政府資料開放授權條款第1版",
    }],
    title,
    summary: cleanText(raw.試驗目的),
    language: containsCjk(title) ? "zh-Hant" : "unknown",
    conditions: uniqueText([raw.適應症中文]),
    phases: uniqueText([raw.臨床試驗期別]),
    studyType: cleanText(raw.本臨床試驗規模),
    interventions: [],
    recruitment: {
      raw: status,
      category,
      acceptingNewParticipants: category === "open" || category === "opening_soon",
    },
    eligibility: {
      inclusion: cleanText(raw.納入條件),
      exclusion: cleanText(raw.排除條件),
    },
    // The current TFDA export identifies a Taiwan approval record, but does
    // not publish a study-site field. Keep Taiwan priority in regionTier and
    // leave locations empty so the UI never presents provenance as a site.
    locations: [],
    contacts: [],
    regionTier: "taiwan",
  });
}

function recordMatches(record: TfdaRecord, query: string): boolean {
  const haystack = [record.臨床試驗計畫中文名稱, record.適應症中文, record.試驗目的]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("zh-Hant");
  return query.split(/\s+/u).filter(Boolean).every((term) => haystack.includes(term));
}

export async function loadOfficialTfdaRecords(fetcher: typeof fetch = fetch): Promise<TfdaRecord[]> {
  const response = await fetcher(TFDA_DATASET_URL, {
    headers: { Accept: "application/json, application/zip" }, cache: "no-store",
  });
  if (!response.ok) throw new Error(`TFDA returned HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error("TFDA archive exceeds the configured safety limit");
  const isZip = response.headers.get("content-type")?.includes("zip") || (bytes[0] === 0x50 && bytes[1] === 0x4b);
  let jsonBytes = bytes;
  if (isZip) {
    let jsonName: string | undefined;
    let oversizedJson = false;
    const entries = unzipSync(bytes, { filter: (file) => {
      if (jsonName || !file.name.toLocaleLowerCase("en").endsWith(".json")) return false;
      if (file.originalSize > MAX_JSON_BYTES) {
        oversizedJson = true;
        return false;
      }
      jsonName = file.name;
      return true;
    } });
    if (oversizedJson) throw new Error("TFDA JSON exceeds the configured safety limit");
    const extractedJson = jsonName ? entries[jsonName] : undefined;
    if (!extractedJson) throw new Error("TFDA archive contains no JSON file");
    jsonBytes = extractedJson;
  }
  if (jsonBytes.byteLength > MAX_JSON_BYTES) throw new Error("TFDA JSON exceeds the configured safety limit");
  const parsed = z.array(tfdaRecordSchema).parse(JSON.parse(strFromU8(jsonBytes)));
  return parsed.filter((record) =>
    Boolean(cleanText(record.臨床試驗計畫書編號) ?? cleanText(record.TFDA收文號)) &&
    Boolean(cleanText(record.臨床試驗計畫中文名稱)),
  );
}

let officialSnapshot: StaleWhileRevalidateSnapshot<TfdaRecord[]> | undefined;

export class TfdaAdapter implements TrialRegistryAdapter {
  readonly registry = "TFDA" as const;
  private readonly fetcher: typeof fetch;
  private readonly recordLoader?: () => Promise<TfdaRecord[]>;
  private readonly snapshotPath?: string;
  private readonly now?: () => number;

  constructor(fetcher: typeof fetch = fetch, recordLoader?: () => Promise<TfdaRecord[]>, options: { snapshotPath?: string | null; now?: () => number } = {}) {
    this.fetcher = fetcher;
    this.recordLoader = recordLoader;
    this.snapshotPath = options.snapshotPath === null ? undefined : options.snapshotPath ?? process.env.TFDA_SNAPSHOT_PATH;
    this.now = options.now;
  }

  private async records(retrievedAt: string): Promise<SnapshotRead<TfdaRecord[]>> {
    if (this.recordLoader) return { value: await this.recordLoader(), mode: "live", loadedAt: retrievedAt, storage: "process_memory" };
    if (this.snapshotPath) return readTfdaSnapshotFile(this.snapshotPath, this.now?.() ?? Date.now());
    officialSnapshot ??= new StaleWhileRevalidateSnapshot({
      load: () => loadOfficialTfdaRecords(this.fetcher),
      freshForMs: tfdaSnapshotFreshMs,
      maxAgeMs: tfdaSnapshotMaxAgeMs,
    });
    return officialSnapshot.read();
  }

  async search(input: TrialSearchInput, options: TrialAdapterSearchOptions = {}): Promise<TrialAdapterResult> {
    const retrievedAt = new Date().toISOString();
    const query = input.condition.toLocaleLowerCase("zh-Hant").trim();
    options.signal?.throwIfAborted();
    const snapshot = await waitForPromiseWithSignal(this.records(retrievedAt), options.signal);
    options.signal?.throwIfAborted();
    const trials = snapshot.value
      .filter((record) => recordMatches(record, query))
      .map((record) => normalizeTfdaRecord(record, retrievedAt))
      .filter((trial) => input.includeNotOpen || trial.recruitment.acceptingNewParticipants)
      .slice(0, input.pageSize);
    return {
      registry: this.registry,
      retrievedAt,
      sourceVersion: trials.map((trial) => trial.sources[0].lastUpdated ?? "").sort().at(-1),
      trials,
      dataState: { mode: snapshot.mode, loadedAt: snapshot.loadedAt, storage: snapshot.storage },
      warning: `TFDA records identify approved Taiwan trials; recruitment status and sites must be reconfirmed with the study team.${snapshot.mode === "stale_cache" ? snapshot.storage === "scheduled_file" ? " The scheduled snapshot is older than 24 hours and must be refreshed by the ingestion job; it is never used beyond seven days." : " A bounded stale snapshot is shown and a background refresh was requested; it is never used beyond seven days." : ""}`,
    };
  }
}
