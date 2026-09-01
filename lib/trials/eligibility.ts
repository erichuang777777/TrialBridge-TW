import { cleanText } from "./text.ts";

export function splitEligibilityCriteria(value?: string): { combined?: string; inclusion?: string; exclusion?: string } {
  const combined = cleanText(value);
  if (!combined) return {};
  const exclusionMarker = /\bExclusion Criteria\s*:?\s*/iu.exec(combined);
  const inclusionMarker = /\bInclusion Criteria\s*:?\s*/iu.exec(combined);
  const inclusionStart = inclusionMarker ? inclusionMarker.index + inclusionMarker[0].length : 0;
  const exclusionStart = exclusionMarker ? exclusionMarker.index + exclusionMarker[0].length : -1;
  const inclusion = exclusionStart >= 0 ? cleanText(combined.slice(inclusionStart, exclusionMarker!.index)) : undefined;
  const exclusion = exclusionStart >= 0 ? cleanText(combined.slice(exclusionStart)) : undefined;
  return { combined, inclusion, exclusion };
}
