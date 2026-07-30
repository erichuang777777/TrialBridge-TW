/* ============================================================================
   Trialign — registry-agnostic retrieval layer

   ClinicalTrials.gov is not a catch-all: not every study registers there, and
   many cross-register with national/regional registries. So retrieval is
   modeled as a set of *adapters* behind one interface. Adding a registry is a
   new adapter here — never a rewrite of the match route.

   Today only the ClinicalTrials.gov adapter is live. The others are declared
   (so the roadmap is legible and the wiring is real) but disabled until their
   normalization is built. `searchRegistries()` fans out across every ENABLED
   adapter, tags each Trial with its source registry, and de-duplicates
   cross-registered studies by a shared registration id where we can.
   ========================================================================== */

import type { Trial } from "./types";
import { searchTrials, type SearchOptions } from "./ctgov";

/** One trial registry we can retrieve recruiting studies from. */
export type Registry = {
  /** Stable id, e.g. "ctgov". */
  id: string;
  /** Display name, e.g. "ClinicalTrials.gov". */
  name: string;
  /** Home URL, for attribution in the UI. */
  url: string;
  /** Live today, or a declared-but-not-yet-implemented roadmap adapter. */
  enabled: boolean;
  /** Fetch normalized recruiting Trials for a condition. */
  search(opts: SearchOptions): Promise<Trial[]>;
};

/** Not-yet-implemented adapter body — keeps the interface honest without faking data. */
function notImplemented(name: string): Registry["search"] {
  return async () => {
    throw new Error(`${name} adapter is not implemented yet.`);
  };
}

/* ---- the ClinicalTrials.gov adapter (the only live one today) ---- */
const ctgov: Registry = {
  id: "ctgov",
  name: "ClinicalTrials.gov",
  url: "https://clinicaltrials.gov/",
  enabled: true,
  search: (opts) => searchTrials(opts),
};

/* ---- declared roadmap adapters (disabled; see PRD P2.4) ----
   Each is a normalization job, not an architectural change: implement `search`
   to return the shared Trial shape and flip `enabled` to true. */
const isrctn: Registry = {
  id: "isrctn",
  name: "ISRCTN (UK)",
  url: "https://www.isrctn.com/",
  enabled: false,
  search: notImplemented("ISRCTN"),
};
const euCtis: Registry = {
  id: "eu-ctis",
  name: "EU CTIS / EU Clinical Trials Register",
  url: "https://euclinicaltrials.eu/",
  enabled: false,
  search: notImplemented("EU CTIS"),
};
const healthCanada: Registry = {
  id: "health-canada",
  name: "Health Canada Clinical Trials Database",
  url: "https://health-products.canada.ca/ctdb-bdec/",
  enabled: false,
  search: notImplemented("Health Canada"),
};

/** Every registry we know about — live and roadmap — in display order. */
export const REGISTRIES: Registry[] = [ctgov, isrctn, euCtis, healthCanada];

/** The subset we actually query today. */
export function enabledRegistries(): Registry[] {
  return REGISTRIES.filter((r) => r.enabled);
}

/**
 * Fan out a condition search across every enabled registry, tag each Trial with
 * its source, and de-duplicate obvious cross-registrations by NCT id. A single
 * registry failing does not sink the whole search — it's logged and skipped.
 */
export async function searchRegistries(opts: SearchOptions): Promise<Trial[]> {
  const live = enabledRegistries();
  const settled = await Promise.allSettled(live.map((r) => r.search(opts)));

  const seen = new Set<string>();
  const merged: Trial[] = [];
  settled.forEach((result, i) => {
    if (result.status === "rejected") {
      console.warn(`[registries] ${live[i].name} search failed:`, result.reason);
      return;
    }
    for (const trial of result.value) {
      const key = trial.nctId || `${live[i].id}:${trial.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...trial, registry: trial.registry || live[i].name });
    }
  });

  // If every enabled registry failed, surface it rather than returning empty.
  if (merged.length === 0 && settled.every((s) => s.status === "rejected")) {
    const first = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
    throw first?.reason instanceof Error ? first.reason : new Error("All registry searches failed.");
  }
  return merged;
}

/** What one leg of an expanded search contributed — reported to the caller so
 *  the coverage of a search is inspectable rather than folded into one number. */
export type SearchLeg = {
  /** The condition term, or the term plus the location that was searched. */
  term: string;
  /** Studies this leg returned that no earlier leg had already returned. */
  added: number;
  /** Set when this leg failed; the search as a whole still proceeds. */
  error?: string;
};

export type ExpandedSearch = {
  trials: Trial[];
  legs: SearchLeg[];
};

/**
 * Run several condition terms (and, optionally, one location-boosted leg) and
 * merge the results into a single de-duplicated pool.
 *
 * Why: `query.cond` is keyword matching, so ONE term is a hard ceiling on what
 * can ever be found. A biomarker-selected basket study registers under "advanced
 * solid tumor", not "breast cancer", and is unreachable from the narrow term no
 * matter how good the downstream reasoning is. Recall lost here cannot be
 * recovered later — nothing downstream can reason about a study it never saw.
 *
 * Every leg is additive and failures are non-fatal: a leg that errors is
 * recorded and skipped. The whole search only fails when the FIRST (primary)
 * term fails, since that is indistinguishable from the registry being down.
 */
export async function searchExpanded(opts: {
  terms: string[];
  pageSize: number;
  studyTypes?: SearchOptions["studyTypes"];
  /** Optional location term for one extra, additive leg on the primary term. */
  locn?: string;
  /** Stop once the pool reaches this many distinct studies. */
  cap: number;
}): Promise<ExpandedSearch> {
  const terms = dedupeTerms(opts.terms);
  if (terms.length === 0) throw new Error("At least one condition term is required.");

  const legs: SearchLeg[] = [];
  const seen = new Set<string>();
  const trials: Trial[] = [];

  const absorb = (label: string, found: Trial[]) => {
    let added = 0;
    for (const t of found) {
      if (trials.length >= opts.cap) break;
      const key = t.nctId || `${t.registry}:${t.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      trials.push(t);
      added++;
    }
    legs.push({ term: label, added });
  };

  const plan: { label: string; opts: SearchOptions }[] = terms.map((cond) => ({
    label: cond,
    opts: { cond, pageSize: opts.pageSize, studyTypes: opts.studyTypes },
  }));
  // One additive location-boosted leg on the primary term: the registry ranks
  // location matches its own way, so this surfaces nearby sites that the plain
  // relevance ordering buries. It can only add studies, never remove any.
  if (opts.locn?.trim()) {
    plan.push({
      label: `${terms[0]} @ ${opts.locn.trim()}`,
      opts: { cond: terms[0], pageSize: opts.pageSize, studyTypes: opts.studyTypes, locn: opts.locn.trim() },
    });
  }

  const settled = await Promise.allSettled(plan.map((p) => searchRegistries(p.opts)));

  settled.forEach((result, i) => {
    if (result.status === "rejected") {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      legs.push({ term: plan[i].label, added: 0, error: message });
      // The primary term failing means the registry is unreachable, not that the
      // patient has no matches — surface it instead of returning a thin pool.
      if (i === 0) throw result.reason instanceof Error ? result.reason : new Error(message);
      return;
    }
    absorb(plan[i].label, result.value);
  });

  return { trials, legs };
}

/** Case-insensitive de-duplication that preserves the caller's ordering, so the
 *  primary term always stays first. */
function dedupeTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const term = (raw ?? "").trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}
