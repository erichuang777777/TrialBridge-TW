import type { NormalizedTrial } from "../types.ts";

/**
 * Which public records a deployment keeps in its index.
 *
 * - `full`: every record the registries return.
 * - `demo`: every Taiwan and Asia tier record, plus worldwide records that are
 *   still accepting or about to accept participants. This keeps a hosted
 *   index around a quarter of the full corpus while preserving the
 *   Taiwan-first product story and the "include closed records" toggle for
 *   the regions people can travel to.
 *
 * The SQL form is used when exporting a subset from an existing SQLite file;
 * the predicate is used by the scheduled sync so incremental refreshes do not
 * slowly refill a demo index with worldwide closed records.
 */
export type TrialIndexProfile = "full" | "demo";

export const demoProfileRecruitmentCategories = ["open", "opening_soon", "invitation_only"] as const;
export const demoProfileRegionTiers = ["taiwan", "asia"] as const;

export function resolveTrialIndexProfile(value = process.env.TRIAL_INDEX_PROFILE): TrialIndexProfile {
  const normalized = value?.trim().toLocaleLowerCase("en");
  if (!normalized || normalized === "full") return "full";
  if (normalized === "demo") return "demo";
  throw new Error("TRIAL_INDEX_PROFILE must be full or demo");
}

export function trialMatchesIndexProfile(trial: Pick<NormalizedTrial, "regionTier" | "recruitment">, profile: TrialIndexProfile): boolean {
  if (profile === "full") return true;
  return (demoProfileRegionTiers as readonly string[]).includes(trial.regionTier)
    || (demoProfileRecruitmentCategories as readonly string[]).includes(trial.recruitment.category);
}

/** SQL predicate over the `trial_records` columns, for bulk subset export. */
export function trialIndexProfileSqlPredicate(profile: TrialIndexProfile): string {
  if (profile === "full") return "1=1";
  const tiers = demoProfileRegionTiers.map((tier) => `'${tier}'`).join(", ");
  const categories = demoProfileRecruitmentCategories.map((category) => `'${category}'`).join(", ");
  return `(region_tier IN (${tiers}) OR recruitment_category IN (${categories}))`;
}
