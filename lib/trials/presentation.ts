import type { NormalizedTrial, RecruitmentCategory, RegionTier } from "./types.ts";

export type TrialPhaseFilter = "all" | "phase1" | "phase1_2" | "phase2" | "phase2_3" | "phase3" | "phase4" | "na";
export type TrialRegionFilter = "all" | RegionTier;
export type TrialRecruitmentFilter = "all" | RecruitmentCategory;

const romanNumbers: Record<string, string> = {
  "Ⅰ": "1", "Ⅱ": "2", "Ⅲ": "3", "Ⅳ": "4",
  "ⅰ": "1", "ⅱ": "2", "ⅲ": "3", "ⅳ": "4",
};

function normalizedPhaseText(values: string[]): string {
  return values.join(" ").replace(/[ⅠⅡⅢⅣⅰⅱⅲⅳ]/g, (value) => romanNumbers[value] ?? value).toLocaleUpperCase("en");
}

export function trialPhaseFilter(trial: Pick<NormalizedTrial, "phases">): Exclude<TrialPhaseFilter, "all"> {
  const text = normalizedPhaseText(trial.phases);
  if (!text || /\b(?:NA|N\/A|NOT APPLICABLE)\b/.test(text)) return "na";
  const phases = new Set([...text.matchAll(/(?:PHASE|EARLY_PHASE)\s*([1-4])/g)].map((match) => Number(match[1])));
  if (phases.has(1) && phases.has(2)) return "phase1_2";
  if (phases.has(2) && phases.has(3)) return "phase2_3";
  if (phases.has(1)) return "phase1";
  if (phases.has(2)) return "phase2";
  if (phases.has(3)) return "phase3";
  if (phases.has(4)) return "phase4";
  return "na";
}

export function phaseLabel(phase: Exclude<TrialPhaseFilter, "all">, language: "en" | "zh-Hant" = "en"): string {
  if (phase === "na") return language === "en" ? "Phase N/A" : "未標示期別";
  return `Phase ${phase.replace("phase", "").replace("_", "/")}`;
}

export interface ConditionBadge {
  label: string;
  kind: "condition" | "stage";
}

export function conditionBadges(conditions: string[], maximum = 6): { badges: ConditionBadge[]; hiddenCount: number } {
  const output: ConditionBadge[] = [];
  const seen = new Set<string>();
  const add = (label: string, kind: ConditionBadge["kind"]) => {
    const normalized = label.trim().replace(/\s+/g, " ");
    const key = `${kind}:${normalized.toLocaleLowerCase("en")}`;
    if (!normalized || /^(?:na|n\/a|not applicable)$/i.test(normalized) || seen.has(key)) return;
    seen.add(key);
    output.push({ label: normalized, kind });
  };

  for (const condition of conditions) {
    const normalized = condition.trim().replace(/\s+/g, " ");
    if (!normalized || /^(?:na|n\/a|not applicable)$/i.test(normalized)) continue;
    const staged = normalized.match(/^(.+?)\s+Stages?\s+([0-9IVX]+)$/i);
    if (staged) {
      add(staged[1], "condition");
      add(`Stage ${staged[2].toLocaleUpperCase("en")}`, "stage");
    } else {
      add(normalized, "condition");
    }
  }

  return { badges: output.slice(0, maximum), hiddenCount: Math.max(0, output.length - maximum) };
}

export function regionLabel(region: RegionTier, language: "en" | "zh-Hant" = "en"): string {
  const labels = {
    taiwan: { en: "Taiwan", "zh-Hant": "台灣" },
    asia: { en: "Asia", "zh-Hant": "亞洲" },
    world: { en: "Worldwide", "zh-Hant": "全球" },
    unknown: { en: "Sites not published", "zh-Hant": "試驗地點未公開" },
  } as const;
  return labels[region][language];
}

export function recruitmentLabel(trial: Pick<NormalizedTrial, "recruitment">, language: "en" | "zh-Hant" = "en"): string {
  const raw = trial.recruitment.raw.trim().toLocaleUpperCase("en");
  const rawLabels: Record<string, { en: string; "zh-Hant": string }> = {
    RECRUITING: { en: "Recruiting", "zh-Hant": "招募中" },
    NOT_YET_RECRUITING: { en: "Not yet recruiting", "zh-Hant": "尚未招募" },
    ENROLLING_BY_INVITATION: { en: "Invitation only", "zh-Hant": "僅限邀請" },
    ACTIVE_NOT_RECRUITING: { en: "Active, not recruiting", "zh-Hant": "進行中，未招募" },
    COMPLETED: { en: "Completed", "zh-Hant": "已完成" },
    TERMINATED: { en: "Terminated", "zh-Hant": "已終止" },
    WITHDRAWN: { en: "Withdrawn", "zh-Hant": "已撤回" },
    SUSPENDED: { en: "Suspended", "zh-Hant": "已暫停" },
  };
  if (rawLabels[raw]) return rawLabels[raw][language];
  const categoryLabels = {
    open: { en: "Recruiting", "zh-Hant": "招募中" },
    opening_soon: { en: "Not yet recruiting", "zh-Hant": "尚未招募" },
    invitation_only: { en: "Invitation only", "zh-Hant": "僅限邀請" },
    not_open: { en: "Not recruiting", "zh-Hant": "未招募" },
    unknown: { en: "Status not published", "zh-Hant": "招募狀態未公開" },
  } as const;
  return categoryLabels[trial.recruitment.category][language];
}

export function trialMatchesFilters(trial: NormalizedTrial, filters: {
  phase: TrialPhaseFilter;
  region: TrialRegionFilter;
  recruitment: TrialRecruitmentFilter;
}): boolean {
  return (filters.phase === "all" || trialPhaseFilter(trial) === filters.phase)
    && (filters.region === "all" || trial.regionTier === filters.region)
    && (filters.recruitment === "all" || trial.recruitment.category === filters.recruitment);
}
