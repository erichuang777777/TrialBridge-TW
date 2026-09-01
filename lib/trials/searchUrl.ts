import { hasDirectIdentifiers } from "../privacy/mask.ts";
import { createRegistryQueryPlan } from "./queryBridge.ts";

export const defaultPublicTrialCondition = "breast cancer";

export interface PublicTrialSearchUrlState {
  condition: string;
  includeNotOpen: boolean;
  hasExplicitCondition: boolean;
  rejectedCondition: boolean;
}

export function normalizePublicTrialCondition(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || normalized.length < 2 || normalized.length > 120 || /[\r\n]/.test(normalized) || hasDirectIdentifiers(normalized)) return undefined;
  return normalized;
}

export function normalizeShareablePublicTrialCondition(value: string | null | undefined): string | undefined {
  const normalized = normalizePublicTrialCondition(value);
  if (!normalized || createRegistryQueryPlan(normalized).strategy !== "curated_bilingual_cancer_lexicon") return undefined;
  return normalized;
}

export function parsePublicTrialSearchParams(search: string): PublicTrialSearchUrlState {
  const params = new URLSearchParams(search);
  const hasExplicitCondition = params.has("condition");
  const requested = params.get("condition");
  const normalized = normalizeShareablePublicTrialCondition(requested);
  return {
    condition: normalized ?? defaultPublicTrialCondition,
    includeNotOpen: Boolean(normalized && params.get("includeNotOpen") === "1"),
    hasExplicitCondition,
    rejectedCondition: hasExplicitCondition && !normalized,
  };
}

export function createPublicTrialSearchPath(condition: string, includeNotOpen: boolean): string {
  const normalized = normalizeShareablePublicTrialCondition(condition);
  if (!normalized) throw new Error("A public trial search link requires one curated general cancer condition without direct identifiers.");
  const params = new URLSearchParams({ condition: normalized });
  if (includeNotOpen) params.set("includeNotOpen", "1");
  return `/trials?${params.toString()}`;
}
