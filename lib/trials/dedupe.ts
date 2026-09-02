import { normalizeIdentifier, uniqueText } from "./text.ts";
import type { NormalizedTrial } from "./types.ts";

function sharedIdentifier(left: NormalizedTrial, right: NormalizedTrial): boolean {
  const leftIds = new Set(left.identifiers.map(normalizeIdentifier));
  return right.identifiers.some((identifier) => leftIds.has(normalizeIdentifier(identifier)));
}

function mergeExactDuplicate(primary: NormalizedTrial, duplicate: NormalizedTrial): NormalizedTrial {
  const clinicalTrialsGovRecord = primary.sources.some((source) => source.registry === "ClinicalTrials.gov")
    ? primary
    : duplicate.sources.some((source) => source.registry === "ClinicalTrials.gov")
      ? duplicate
      : undefined;
  return {
    ...primary,
    identifiers: uniqueText([...primary.identifiers, ...duplicate.identifiers]).map(normalizeIdentifier),
    sources: [...primary.sources, ...duplicate.sources].filter((source, index, sources) =>
      sources.findIndex((candidate) =>
        candidate.registry === source.registry && candidate.registryId === source.registryId,
      ) === index,
    ),
    conditions: uniqueText([...primary.conditions, ...duplicate.conditions]),
    phases: uniqueText([...primary.phases, ...duplicate.phases]),
    interventions: uniqueText([...primary.interventions, ...duplicate.interventions]),
    recruitment: clinicalTrialsGovRecord?.recruitment ?? (primary.recruitment.category === "unknown" ? duplicate.recruitment : primary.recruitment),
    eligibility: {
      combined: primary.eligibility.combined ?? duplicate.eligibility.combined,
      inclusion: primary.eligibility.inclusion ?? duplicate.eligibility.inclusion,
      exclusion: primary.eligibility.exclusion ?? duplicate.eligibility.exclusion,
      minimumAge: primary.eligibility.minimumAge ?? duplicate.eligibility.minimumAge,
      maximumAge: primary.eligibility.maximumAge ?? duplicate.eligibility.maximumAge,
      sex: primary.eligibility.sex ?? duplicate.eligibility.sex,
    },
    locations: [...primary.locations, ...duplicate.locations].filter((location, index, locations) =>
      locations.findIndex((candidate) =>
        [candidate.country, candidate.city, candidate.facility].join("|").toLocaleLowerCase("en") ===
        [location.country, location.city, location.facility].join("|").toLocaleLowerCase("en"),
      ) === index,
    ),
    contacts: [...primary.contacts, ...duplicate.contacts].filter((contact, index, contacts) =>
      contacts.findIndex((candidate) =>
        [candidate.role, candidate.name, candidate.facility, candidate.affiliation].join("|").toLocaleLowerCase("en") ===
        [contact.role, contact.name, contact.facility, contact.affiliation].join("|").toLocaleLowerCase("en"),
      ) === index,
    ),
  };
}

function hasTfdaSource(trial: NormalizedTrial): boolean {
  return trial.sources.some((source) => source.registry === "TFDA");
}

export function deduplicateTrials(trials: NormalizedTrial[]): NormalizedTrial[] {
  const deduplicated: NormalizedTrial[] = [];
  for (const trial of trials) {
    const duplicateIndex = deduplicated.findIndex((candidate) => sharedIdentifier(candidate, trial));
    if (duplicateIndex === -1) {
      deduplicated.push(trial);
      continue;
    }
    const existing = deduplicated[duplicateIndex];
    const primary = hasTfdaSource(existing)
      ? existing
      : hasTfdaSource(trial)
        ? trial
        : existing.regionTier === "taiwan"
          ? existing
          : trial.regionTier === "taiwan"
            ? trial
            : existing;
    const secondary = primary === existing ? trial : existing;
    deduplicated[duplicateIndex] = mergeExactDuplicate(primary, secondary);
  }
  return deduplicated;
}
