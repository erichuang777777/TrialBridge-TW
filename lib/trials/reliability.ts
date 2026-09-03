export const registrySourceTimeoutMs = 20_000;

/**
 * Budget for one catalog search: the public index query plus any live
 * registry fallback. Hosted functions with a short synchronous limit (Netlify:
 * 10 s) set TRIAL_SEARCH_DEADLINE_MS below that limit so a slow index answers
 * with a SOURCE_TIMEOUT failure the page can show instead of a platform 504.
 * Defaults to the per-source registry deadline; out-of-range values are
 * ignored rather than trusted.
 */
type SearchDeadlineEnvironment = Partial<Record<"TRIAL_SEARCH_DEADLINE_MS", string>>;

export function resolveTrialSearchDeadlineMs(environment: SearchDeadlineEnvironment = process.env as SearchDeadlineEnvironment): number {
  const raw = environment.TRIAL_SEARCH_DEADLINE_MS?.trim();
  if (!raw) return registrySourceTimeoutMs;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 120_000) return registrySourceTimeoutMs;
  return parsed;
}

export function formatRegistryDuration(durationMs: number): string {
  const bounded = Math.max(0, Math.round(durationMs));
  if (bounded < 1_000) return `${bounded} ms`;
  return `${(bounded / 1_000).toFixed(bounded < 10_000 ? 1 : 0)} s`;
}
