export const registrySourceTimeoutMs = 20_000;

export function formatRegistryDuration(durationMs: number): string {
  const bounded = Math.max(0, Math.round(durationMs));
  if (bounded < 1_000) return `${bounded} ms`;
  return `${(bounded / 1_000).toFixed(bounded < 10_000 ? 1 : 0)} s`;
}
