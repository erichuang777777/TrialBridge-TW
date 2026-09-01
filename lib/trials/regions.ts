import type { NormalizedTrial, RegionTier } from "./types.ts";

const ASIA_COUNTRIES = new Set([
  "bangladesh", "bhutan", "brunei", "cambodia", "china", "hong kong", "india",
  "indonesia", "japan", "kazakhstan", "laos", "macao", "malaysia", "maldives",
  "mongolia", "myanmar", "nepal", "pakistan", "philippines", "singapore",
  "south korea", "korea, republic of", "sri lanka", "taiwan", "thailand", "vietnam",
]);

function normalizedCountry(country: string): string {
  return country.trim().toLocaleLowerCase("en");
}

export function regionTierForCountries(countries: string[], isTfda = false): RegionTier {
  if (isTfda || countries.some((country) => normalizedCountry(country) === "taiwan")) return "taiwan";
  if (countries.some((country) => ASIA_COUNTRIES.has(normalizedCountry(country)))) return "asia";
  if (countries.length > 0) return "world";
  return "unknown";
}

const tierWeight: Record<RegionTier, number> = { taiwan: 0, asia: 1, world: 2, unknown: 3 };

export function rankTrials(trials: NormalizedTrial[]): NormalizedTrial[] {
  return [...trials].sort((left, right) => {
    const regionDifference = tierWeight[left.regionTier] - tierWeight[right.regionTier];
    if (regionDifference !== 0) return regionDifference;
    const openDifference = Number(right.recruitment.acceptingNewParticipants) - Number(left.recruitment.acceptingNewParticipants);
    if (openDifference !== 0) return openDifference;
    const leftUpdated = left.sources.map((source) => source.lastUpdated ?? "").sort().at(-1) ?? "";
    const rightUpdated = right.sources.map((source) => source.lastUpdated ?? "").sort().at(-1) ?? "";
    const freshness = rightUpdated.localeCompare(leftUpdated);
    return freshness || left.canonicalId.localeCompare(right.canonicalId);
  });
}
