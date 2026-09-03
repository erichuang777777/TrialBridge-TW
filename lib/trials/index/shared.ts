import { createHash, randomUUID } from "node:crypto";
import { normalizedTrialSchema } from "../schema.ts";
import type { NormalizedTrial, RegistryName } from "../types.ts";
import type { TrialIndexSourceState, TrialIndexSourceStatus } from "./types.ts";

export type IndexedRegistryName = "TFDA" | "ClinicalTrials.gov";
export const trackedRegistries: IndexedRegistryName[] = ["TFDA", "ClinicalTrials.gov"];

export function serializeTrial(trial: NormalizedTrial): string {
  return JSON.stringify(normalizedTrialSchema.parse(trial));
}

export function deserializeTrial(payload: string): NormalizedTrial {
  return normalizedTrialSchema.parse(JSON.parse(payload));
}

export function contentHash(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

export function trialContentHash(trial: NormalizedTrial): string {
  const stable = { ...trial, sources: trial.sources.map(({ retrievedAt: _retrievedAt, ...source }) => source) };
  return contentHash(JSON.stringify(stable));
}

export function searchableText(trial: NormalizedTrial): string {
  return augmentCjkSearchText([
    trial.title,
    trial.officialTitle,
    ...trial.identifiers,
    ...trial.conditions,
    ...trial.interventions,
    ...trial.locations.flatMap((location) => [location.country, location.city, location.facility]),
  ].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase("en"));
}

export function augmentCjkSearchText(value: string): string {
  const bigrams = (value.match(/[\u3400-\u9fff]+/gu) ?? []).flatMap((run) => {
    const characters = [...run];
    if (characters.length < 2) return [];
    return characters.slice(0, -1).map((character, index) => `${character}${characters[index + 1]}`);
  });
  return bigrams.length ? `${value} ${[...new Set(bigrams)].join(" ")}` : value;
}

export function normalizedSearchTerms(terms: string[]): string[] {
  return [...new Set(terms
    .map((term) => term.normalize("NFKC").toLocaleLowerCase("en").trim())
    .filter((term) => term.length >= 2))].slice(0, 16);
}

export function searchTermTokens(term: string): string[] {
  const tokens: string[] = [];
  const append = (segment: string, cjk: boolean) => {
    const characters = [...segment];
    if (cjk && characters.length > 2) {
      tokens.push(...characters.slice(0, -1).map((character, index) => `${character}${characters[index + 1]}`));
    } else if (segment) {
      tokens.push(segment);
    }
  };
  for (const raw of term.match(/[\p{L}\p{N}]+/gu) ?? []) {
    let segment = "";
    let segmentIsCjk: boolean | undefined;
    for (const character of raw) {
      const characterIsCjk = /[\u3400-\u9fff]/u.test(character);
      if (segment && characterIsCjk !== segmentIsCjk) {
        append(segment, Boolean(segmentIsCjk));
        segment = "";
      }
      segment += character;
      segmentIsCjk = characterIsCjk;
    }
    append(segment, Boolean(segmentIsCjk));
  }
  return [...new Set(tokens)];
}

export function sourceRegistryId(trial: NormalizedTrial, registry: RegistryName): string {
  const source = trial.sources.find((candidate) => candidate.registry === registry);
  if (!source) throw new Error(`Trial ${trial.canonicalId} has no ${registry} source`);
  // One TFDA receipt can contain multiple protocol records. This internal key
  // preserves each protocol while the payload retains the public receipt ID.
  return registry === "TFDA" ? `${source.registryId}::${trial.canonicalId}` : source.registryId;
}

export function newRunId(registry: RegistryName): string {
  return `${registry === "TFDA" ? "tfda" : "ctgov"}-${randomUUID()}`;
}

export function completedSyncTiming(startedAt: string, now = new Date()) {
  const finishedAt = now.toISOString();
  const startedMs = Date.parse(startedAt);
  return {
    finishedAt,
    durationMs: Number.isFinite(startedMs) ? Math.max(0, now.getTime() - startedMs) : 0,
  };
}

export function publicFailureMessage(error: unknown): string {
  if (error instanceof Error && /HTTP \d{3}/.test(error.message)) return error.message.slice(0, 240);
  return "Registry synchronization failed; the last successful public index remains available.";
}

export function classifySourceStatus(lastSuccessAt: string | undefined, registry: RegistryName, current: TrialIndexSourceStatus, nowMs = Date.now()): TrialIndexSourceStatus {
  if (current === "syncing" || current === "failed" || !lastSuccessAt) return current;
  const age = Math.max(0, nowMs - Date.parse(lastSuccessAt));
  const staleAfter = registry === "ClinicalTrials.gov" ? 36 * 60 * 60_000 : 8 * 24 * 60 * 60_000;
  return age > staleAfter ? "stale" : "ready";
}

export function emptySourceState(registry: RegistryName): TrialIndexSourceState {
  return { registry, status: "never_synced", recordCount: 0, changedCount: 0, removedCount: 0 };
}
