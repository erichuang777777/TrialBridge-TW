/* ============================================================================
   Trialign — deterministic structural gates (age band · sex)

   ClinicalTrials.gov publishes `sex`, `minimumAge` and `maximumAge` as STRUCTURED
   fields, separate from the eligibility prose. Those two facts are decidable in
   code: a 62-year-old cannot enter a study whose minimum age is 65, and no amount
   of model reasoning changes that. Before this module those fields were fetched
   and normalized but never consulted — the app spent a full Opus reasoning call
   discovering, from prose, something the registry had already stated as data.

   Two things this buys, both clinical rather than cosmetic:
     1. Reasoning budget stops being spent on studies the patient definitionally
        cannot enter, so the deep-reasoning slots go to real candidates.
     2. The exclusion is stated as fact ("Enrolls ages 65 and over"), not as a
        model's paraphrase of prose.

   The gate is deliberately timid. It fires ONLY when the patient's value is
   confidently known AND the registry's value is unambiguous. Anything less
   returns null and the study proceeds to normal reasoning — a study wrongly
   dropped here is invisible to the patient, which is the one failure mode this
   product cannot have.
   ========================================================================== */

import type { Trial } from "./types";

export type PatientDemographics = {
  /** Age in years, or null when we could not read one confidently. */
  ageYears: number | null;
  /** Biological sex as the registry means it, or null when unknown. */
  sex: "female" | "male" | null;
};

/* ---- reading the patient's side ---- */

/** "62 Years" · "6 Months" · "18" → age in years (fractional for months/weeks/days). */
function parseRegistryAge(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)\s*(year|month|week|day|hour|minute)?s?\b/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  switch (m[2]) {
    case "month":
      return n / 12;
    case "week":
      return n / 52;
    case "day":
      return n / 365;
    case "hour":
    case "minute":
      return 0;
    default:
      return n; // "years" or a bare number
  }
}

/** Ages we will act on. Anything outside this is treated as unreadable rather
 *  than trusted — a mis-parsed age that silently hides trials is the worst
 *  outcome available here. */
function plausibleAge(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 120;
}

function ageFromText(text: string): number | null {
  const patterns = [
    /\b(\d{1,3})\s*(?:-|\s)?(?:year|yr)s?(?:\s|-)?old\b/i,
    /\b(\d{1,3})\s*y\/?o\b/i,
    /\bage[d]?\s*[:=]?\s*(\d{1,3})\b/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const n = Number(m[1]);
      if (plausibleAge(n)) return n;
    }
  }
  return null;
}

function sexFromText(text: string): "female" | "male" | null {
  // Word-bounded, so "female" inside "female-only" still matches while a mere
  // substring of an unrelated word does not.
  const female = /\b(female|woman|women|she\/her)\b/i.test(text);
  const male = /\b(male|man|men|he\/him)\b/i.test(text);
  // Both present means the prose is ambiguous ("seen at the women's clinic; the
  // patient is a man"). Reading one of them would exclude every study of the
  // other sex — invisibly. Ambiguity resolves to "unknown", so no gate fires.
  if (female === male) return null;
  return female ? "female" : "male";
}

/** Read age and sex out of the structured profile, preferring an explicitly
 *  labeled field over anything inferred from prose. */
export function derivePatientDemographics(
  fields: { label: string; value: string }[],
  summary?: string,
): PatientDemographics {
  let ageYears: number | null = null;
  let sex: "female" | "male" | null = null;

  for (const f of fields) {
    const label = f.label.toLowerCase();
    const value = (f.value ?? "").trim();
    if (!value || /not found|unknown|n\/a|^—$/i.test(value)) continue;

    if (ageYears === null && /\bage\b/i.test(label)) {
      // "62" · "62 years" · "62 y/o". A date of birth is deliberately NOT read:
      // deriving an age from it would mean carrying a direct identifier through
      // the profile, which the privacy posture says we do not need.
      const bare = /^\s*(\d{1,3})(?:\s*(?:years?|yrs?|y\/?o))?\s*$/i.exec(value);
      const parsed = bare ? Number(bare[1]) : ageFromText(value);
      if (parsed !== null && plausibleAge(parsed)) ageYears = parsed;
    }
    if (sex === null && /\bsex\b|\bgender\b/i.test(label)) {
      sex = sexFromText(value);
    }
  }

  // Fall back to the one-line summary ("HR+/HER2− metastatic breast cancer in a
  // 62-year-old woman, 2 prior lines"), which is where these facts usually live.
  const text = summary ?? "";
  if (ageYears === null && text) ageYears = ageFromText(text);
  if (sex === null && text) sex = sexFromText(text);

  return { ageYears, sex };
}

/* ---- reading the trial's side ---- */

export type StructuralGate = {
  /** Plain-language reason this study is definitionally out for this patient. */
  reason: string;
};

/**
 * Decide whether a study is ruled out for this patient by the registry's own
 * structured eligibility fields. Returns null whenever we are not certain —
 * including whenever the patient's value is unknown.
 */
export function structuralExclusion(trial: Trial, demo: PatientDemographics): StructuralGate | null {
  // --- sex ---
  const trialSex = (trial.sex ?? "").trim().toUpperCase();
  if (demo.sex && (trialSex === "FEMALE" || trialSex === "MALE")) {
    const enrolls = trialSex === "FEMALE" ? "female" : "male";
    if (enrolls !== demo.sex) {
      return { reason: `Enrolls ${enrolls} participants only.` };
    }
  }

  // --- age band ---
  if (demo.ageYears !== null) {
    const min = parseRegistryAge(trial.minimumAge ?? "");
    const max = parseRegistryAge(trial.maximumAge ?? "");
    if (min !== null && plausibleAge(min) && demo.ageYears < min) {
      return { reason: `Minimum age is ${trial.minimumAge.trim()}; the record gives age ${fmtAge(demo.ageYears)}.` };
    }
    if (max !== null && plausibleAge(max) && demo.ageYears > max) {
      return { reason: `Maximum age is ${trial.maximumAge.trim()}; the record gives age ${fmtAge(demo.ageYears)}.` };
    }
  }

  return null;
}

function fmtAge(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
