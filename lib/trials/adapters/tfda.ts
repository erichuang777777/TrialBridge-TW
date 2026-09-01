import { strFromU8, unzipSync } from "fflate";
import { z } from "zod";
import { normalizedTrialSchema } from "../schema.ts";
import { cleanText, containsCjk, normalizeIdentifier, uniqueText } from "../text.ts";
import { StaleWhileRevalidateSnapshot, type SnapshotRead } from "../snapshotCache.ts";
import type {
  NormalizedTrial,
  RecruitmentCategory,
  TrialAdapterResult,
  TrialRegistryAdapter,
  TrialSearchInput,
} from "../types.ts";

export const TFDA_DATASET_URL = "https://data.fda.gov.tw/data/opendata/export/205/json";
export const TFDA_DATASET_PAGE = "https://data.gov.tw/dataset/177198";
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_JSON_BYTES = 256 * 1024 * 1024;

const tfdaRecordSchema = z.object({
  臨床試驗申請者: z.string().nullish(),
  臨床試驗計畫書編號: z.string().nullish(),
  臨床試驗計畫中文名稱: z.string().nullish(),
  臨床試驗期別: z.string().nullish(),
  本臨床試驗規模: z.string().nullish(),
  試驗目的: z.string().nullish(),
  試驗預計執行期間起: z.string().nullish(),
  試驗預計執行期間迄: z.string().nullish(),
  適應症中文: z.string().nullish(),
  納入條件: z.string().nullish(),
  排除條件: z.string().nullish(),
  執行狀態: z.string().nullish(),
  TFDA收文號: z.string().nullish(),
  資料更新時間: z.string().nullish(),
}).passthrough();

export type TfdaRecord = z.infer<typeof tfdaRecordSchema>;

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
    locations: [{ country: "Taiwan" }],
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

async function loadOfficialRecords(fetcher: typeof fetch): Promise<TfdaRecord[]> {
  const response = await fetcher(process.env.TFDA_TRIALS_DATA_URL ?? TFDA_DATASET_URL, {
    headers: { Accept: "application/json, application/zip" }, cache: "no-store",
  });
  if (!response.ok) throw new Error(`TFDA returned HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error("TFDA archive exceeds the configured safety limit");
  const isZip = response.headers.get("content-type")?.includes("zip") || (bytes[0] === 0x50 && bytes[1] === 0x4b);
  let jsonBytes = bytes;
  if (isZip) {
    const entries = unzipSync(bytes);
    const jsonName = Object.keys(entries).find((name) => name.toLocaleLowerCase("en").endsWith(".json"));
    if (!jsonName) throw new Error("TFDA archive contains no JSON file");
    jsonBytes = entries[jsonName];
  }
  if (jsonBytes.byteLength > MAX_JSON_BYTES) throw new Error("TFDA JSON exceeds the configured safety limit");
  const parsed = z.array(tfdaRecordSchema).parse(JSON.parse(strFromU8(jsonBytes)));
  return parsed.filter((record) =>
    Boolean(cleanText(record.臨床試驗計畫書編號) ?? cleanText(record.TFDA收文號)) &&
    Boolean(cleanText(record.臨床試驗計畫中文名稱)),
  );
}

const TFDA_FRESH_MS = 24 * 60 * 60 * 1000;
const TFDA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let officialSnapshot: StaleWhileRevalidateSnapshot<TfdaRecord[]> | undefined;

export class TfdaAdapter implements TrialRegistryAdapter {
  readonly registry = "TFDA" as const;
  private readonly fetcher: typeof fetch;
  private readonly recordLoader?: () => Promise<TfdaRecord[]>;

  constructor(fetcher: typeof fetch = fetch, recordLoader?: () => Promise<TfdaRecord[]>) {
    this.fetcher = fetcher;
    this.recordLoader = recordLoader;
  }

  private async records(retrievedAt: string): Promise<SnapshotRead<TfdaRecord[]>> {
    if (this.recordLoader) return { value: await this.recordLoader(), mode: "live", loadedAt: retrievedAt };
    officialSnapshot ??= new StaleWhileRevalidateSnapshot({
      load: () => loadOfficialRecords(this.fetcher),
      freshForMs: TFDA_FRESH_MS,
      maxAgeMs: TFDA_MAX_AGE_MS,
    });
    return officialSnapshot.read();
  }

  async search(input: TrialSearchInput): Promise<TrialAdapterResult> {
    const retrievedAt = new Date().toISOString();
    const query = input.condition.toLocaleLowerCase("zh-Hant").trim();
    const snapshot = await this.records(retrievedAt);
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
      dataState: { mode: snapshot.mode, loadedAt: snapshot.loadedAt },
      warning: `TFDA records identify approved Taiwan trials; recruitment status and sites must be reconfirmed with the study team.${snapshot.mode === "stale_cache" ? " A bounded stale snapshot is shown and a background refresh was requested; it is never used beyond seven days." : ""}`,
    };
  }
}
