import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { bilingualCancerQueryLexicon } from "../queryBridge.ts";

export const NCI_EVS_API_BASE = "https://api-evsrest.nci.nih.gov/api/v1";
const conceptSchema = z.object({ code: z.string(), name: z.string(), version: z.string().optional() });
const searchSchema = z.object({ concepts: z.array(conceptSchema).default([]) });
const detailSchema = conceptSchema.extend({ synonyms: z.array(z.object({ name: z.string() })).optional() });
const snapshotSchema = z.object({
  schemaVersion: z.literal("1.0"), source: z.literal("NCI Thesaurus"), sourceUrl: z.literal(NCI_EVS_API_BASE),
  generatedAt: z.string().datetime(), concepts: z.array(z.object({ query: z.string(), code: z.string(), name: z.string(), version: z.string().optional(), synonyms: z.array(z.string()) })),
});
export type NciTerminologySnapshot = z.infer<typeof snapshotSchema>;

function normalize(value: string) { return value.normalize("NFKC").trim().toLocaleLowerCase("en").replace(/[^\p{L}\p{N}+]+/gu, " ").trim(); }

function diseaseConceptScore(name: string, query: string) {
  const normalizedName = normalize(name);
  const normalizedQuery = normalize(query);
  if (/pathway|terminology|surgery|prophylaxis|questionnaire|finding|history/.test(normalizedName)) return -100;
  let score = normalizedName === normalizedQuery ? 100 : 0;
  const queryTokens = normalizedQuery.split(" ").filter((token) => !["and", "the"].includes(token));
  const tokenMatches = queryTokens.filter((token) => {
    if (token === "cancer") return /cancer|carcinoma|neoplasm|malignan/.test(normalizedName);
    if (token === "tumor") return /tumou?r|neoplasm/.test(normalizedName);
    return normalizedName.includes(token);
  }).length;
  score += tokenMatches * 15;
  if (tokenMatches === queryTokens.length) score += 30;
  if (/carcinoma|neoplasm|cancer|sarcoma|leukemia|lymphoma|myeloma|melanoma|tumou?r/.test(normalizedName)) score += 20;
  if (/childhood|pediatric|paediatric/.test(normalizedName) && !/childhood|pediatric|paediatric/.test(normalizedQuery)) score -= 40;
  score -= Math.max(0, normalizedName.split(" ").length - queryTokens.length) * 2;
  return score;
}

export function resolveNciTerminologyPath(environment: Partial<Record<"NCI_TERMINOLOGY_PATH", string>> = process.env as Partial<Record<"NCI_TERMINOLOGY_PATH", string>>) {
  const resolved = path.resolve(environment.NCI_TERMINOLOGY_PATH?.trim() || path.join(process.cwd(), "data", "public", "nci-terminology.json"));
  if (resolved === path.parse(resolved).root) throw new Error("NCI_TERMINOLOGY_PATH cannot be a filesystem root");
  return resolved;
}

export async function syncNciTerminology(fetcher: typeof fetch = fetch, destination = resolveNciTerminologyPath(), signal?: AbortSignal): Promise<NciTerminologySnapshot> {
  const concepts: NciTerminologySnapshot["concepts"] = [];
  for (const entry of bilingualCancerQueryLexicon) {
    signal?.throwIfAborted();
    const searchUrl = new URL(`${NCI_EVS_API_BASE}/concept/ncit/search`);
    searchUrl.searchParams.set("term", entry.en);
    searchUrl.searchParams.set("type", "match");
    searchUrl.searchParams.set("include", "minimal");
    searchUrl.searchParams.set("fromRecord", "0");
    searchUrl.searchParams.set("pageSize", "10");
    const searchResponse = await fetcher(searchUrl, { headers: { Accept: "application/json" }, cache: "no-store", signal });
    if (!searchResponse.ok) throw new Error(`NCI EVS returned HTTP ${searchResponse.status}`);
    const matches = searchSchema.parse(await searchResponse.json()).concepts;
    const selected = matches.map((candidate) => ({ candidate, score: diseaseConceptScore(candidate.name, entry.en) })).sort((left, right) => right.score - left.score)[0];
    if (!selected || selected.score < 20) continue;
    const detailResponse = await fetcher(`${NCI_EVS_API_BASE}/concept/ncit/${encodeURIComponent(selected.candidate.code)}`, { headers: { Accept: "application/json" }, cache: "no-store", signal });
    if (!detailResponse.ok) throw new Error(`NCI EVS returned HTTP ${detailResponse.status}`);
    const detail = detailSchema.parse(await detailResponse.json());
    concepts.push({ query: entry.en, code: detail.code, name: detail.name, version: detail.version, synonyms: [...new Set([entry.en, ...entry.aliases, ...(detail.synonyms ?? []).map((synonym) => synonym.name)])].slice(0, 120) });
  }
  const snapshot = snapshotSchema.parse({ schemaVersion: "1.0", source: "NCI Thesaurus", sourceUrl: NCI_EVS_API_BASE, generatedAt: new Date().toISOString(), concepts });
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, "utf8");
  await rename(temporary, destination);
  return snapshot;
}

export async function readNciTerminologySnapshot(snapshotPath = resolveNciTerminologyPath()) {
  return snapshotSchema.parse(JSON.parse(await readFile(snapshotPath, "utf8")));
}

export async function expandWithNciTerminology(value: string, snapshotPath = resolveNciTerminologyPath()): Promise<string[]> {
  try {
    const snapshot = await readNciTerminologySnapshot(snapshotPath);
    const requested = normalize(value);
    const concept = snapshot.concepts.find((candidate) => [candidate.query, candidate.name, ...candidate.synonyms].some((term) => normalize(term) === requested));
    return concept ? [concept.name, ...concept.synonyms].slice(0, 24) : [];
  } catch { return []; }
}

export async function inspectNciTerminology(snapshotPath = resolveNciTerminologyPath()) {
  try {
    const file = await stat(snapshotPath);
    const snapshot = await readNciTerminologySnapshot(snapshotPath);
    return { status: "ready" as const, generatedAt: snapshot.generatedAt, conceptCount: snapshot.concepts.length, version: snapshot.concepts.map((concept) => concept.version).filter(Boolean).sort().at(-1), bytes: file.size, containsPatientData: false as const };
  } catch { return { status: "not_synced" as const, conceptCount: 0, containsPatientData: false as const }; }
}
