import { z } from "zod";

export const TFDA_DATASET_URL = "https://data.fda.gov.tw/data/opendata/export/205/json";
export const TFDA_DATASET_PAGE = "https://data.gov.tw/dataset/177198";

export const tfdaRecordSchema = z.object({
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
