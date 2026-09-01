import type { TrialMatch } from "./engine.ts";

export const maxShortlistTrials = 3;

export function toggleShortlistTrial(current: string[], trialId: string): string[] {
  if (!trialId) return current;
  if (current.includes(trialId)) return current.filter((id) => id !== trialId);
  if (current.length >= maxShortlistTrials) return current;
  return [...current, trialId];
}

export function resolveShortlistedMatches(matches: TrialMatch[], trialIds: string[]): TrialMatch[] {
  return [...new Set(trialIds)].slice(0, maxShortlistTrials).flatMap((trialId) => {
    const match = matches.find((candidate) => candidate.trial.canonicalId === trialId);
    return match ? [match] : [];
  });
}
