/* ============================================================================
   Trialign — approximate geography

   We place trial sites against a patient's stated location at CITY / STATE
   granularity. There is no geocoder here and no mileage: everything this module
   returns is an approximation, and every consumer is expected to label it as
   one.

   What changed and why: "Within a few hours" used to resolve to *same country*,
   which put a site 2,500 miles away inside a band the patient read as a drive.
   The band now resolves to *same state or a neighboring state*, which is the
   closest honest statement we can make without geocoding. The ordering is:

     4  same city
     3  same state
     2  neighboring state
     1  same country
     0  unknown / no placeable site

   Travel bands map to the minimum score that counts as "in range":
     local    ("Local only")            → 3  (your state or your city)
     regional ("Within a few hours")    → 2  (your state or one next to it)
     any                                → 0  (no distance filter at all)
   ========================================================================== */

export type TravelPref = "local" | "regional" | "any";

export const US_STATES: Record<string, string> = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california",
  co: "colorado", ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia",
  hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
  ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
  ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi", mo: "missouri",
  mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire", nj: "new jersey",
  nm: "new mexico", ny: "new york", nc: "north carolina", nd: "north dakota", oh: "ohio",
  ok: "oklahoma", or: "oregon", pa: "pennsylvania", ri: "rhode island", sc: "south carolina",
  sd: "south dakota", tn: "tennessee", tx: "texas", ut: "utah", vt: "vermont",
  va: "virginia", wa: "washington", wv: "west virginia", wi: "wisconsin", wy: "wyoming",
  dc: "district of columbia",
};

export const STATE_ABBR: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATES).map(([abbr, name]) => [name, abbr]),
);

/* Land borders between US states. Written one-way and closed symmetrically
   below, so a missing reverse entry can't silently create a one-way border. */
const BORDERS: Record<string, string[]> = {
  alabama: ["florida", "georgia", "mississippi", "tennessee"],
  arizona: ["california", "colorado", "nevada", "new mexico", "utah"],
  arkansas: ["louisiana", "mississippi", "missouri", "oklahoma", "tennessee", "texas"],
  california: ["nevada", "oregon"],
  colorado: ["kansas", "nebraska", "new mexico", "oklahoma", "utah", "wyoming"],
  connecticut: ["massachusetts", "new york", "rhode island"],
  delaware: ["maryland", "new jersey", "pennsylvania"],
  "district of columbia": ["maryland", "virginia"],
  florida: ["georgia"],
  georgia: ["north carolina", "south carolina", "tennessee"],
  idaho: ["montana", "nevada", "oregon", "utah", "washington", "wyoming"],
  illinois: ["indiana", "iowa", "kentucky", "missouri", "wisconsin"],
  indiana: ["kentucky", "michigan", "ohio"],
  iowa: ["minnesota", "missouri", "nebraska", "south dakota", "wisconsin"],
  kansas: ["missouri", "nebraska", "oklahoma"],
  kentucky: ["missouri", "ohio", "tennessee", "virginia", "west virginia"],
  louisiana: ["mississippi", "texas"],
  maine: ["new hampshire"],
  maryland: ["pennsylvania", "virginia", "west virginia"],
  massachusetts: ["new hampshire", "new york", "rhode island", "vermont"],
  michigan: ["ohio", "wisconsin"],
  minnesota: ["north dakota", "south dakota", "wisconsin"],
  mississippi: ["tennessee"],
  missouri: ["nebraska", "oklahoma", "tennessee"],
  montana: ["north dakota", "south dakota", "wyoming"],
  nebraska: ["south dakota", "wyoming"],
  nevada: ["oregon", "utah"],
  "new hampshire": ["vermont"],
  "new jersey": ["new york", "pennsylvania"],
  "new mexico": ["oklahoma", "texas", "utah"],
  "new york": ["pennsylvania", "vermont"],
  "north carolina": ["south carolina", "tennessee", "virginia"],
  "north dakota": ["south dakota"],
  ohio: ["pennsylvania", "west virginia"],
  oklahoma: ["texas"],
  oregon: ["washington"],
  pennsylvania: ["west virginia"],
  "south dakota": ["wyoming"],
  tennessee: ["virginia"],
  utah: ["wyoming"],
  virginia: ["west virginia"],
};

const ADJACENT: Record<string, Set<string>> = (() => {
  const map: Record<string, Set<string>> = {};
  const link = (a: string, b: string) => {
    (map[a] ??= new Set()).add(b);
    (map[b] ??= new Set()).add(a);
  };
  for (const [state, neighbors] of Object.entries(BORDERS)) {
    for (const n of neighbors) link(state, n);
  }
  return map;
})();

/** The patient's location as a token set (city + state name + abbreviation),
 *  plus the resolved home states used for the neighboring-state band. */
export type PatientLoc = {
  tokens: Set<string>;
  /** Full state names we could resolve from what the patient typed. */
  states: Set<string>;
  known: boolean;
};

/** Minimum proximity score that counts as "within range" for a travel band.
 *  0 means no distance filter ran at all. */
export function travelThreshold(t: TravelPref | null): number {
  return t === "local" ? 3 : t === "regional" ? 2 : 0;
}

/** What a band actually means, in the words the UI must use. Kept next to the
 *  thresholds so the copy can never drift from the computation again. */
export function travelLabel(t: TravelPref | null): string {
  return t === "local" ? "in your state" : t === "regional" ? "in or next to your state" : "anywhere";
}

/** Pull the patient's location into a token set for approximate proximity. The
 *  explicitly-entered survey location wins; profile fields read from the note
 *  are a fallback. */
export function derivePatientLoc(fields: { label: string; value: string }[], explicit?: string): PatientLoc {
  const fromFields = fields
    .filter((f) => /location|city|state|region|geograph|reside|home/i.test(f.label))
    .map((f) => f.value)
    .join(", ");
  const raw = [explicit ?? "", fromFields].filter(Boolean).join(", ");
  const tokens = new Set<string>();
  for (const part of raw.split(/[,/;]/)) {
    const p = part.trim().toLowerCase().replace(/\./g, "");
    if (!p || /not found|unknown|n\/a|—/.test(p)) continue;
    tokens.add(p);
    for (const w of p.split(/\s+/)) if (w.length >= 2) tokens.add(w);
  }
  // expand state abbreviation ↔ full name in both directions
  const states = new Set<string>();
  for (const t of Array.from(tokens)) {
    if (US_STATES[t]) {
      tokens.add(US_STATES[t]);
      states.add(US_STATES[t]);
    }
    if (STATE_ABBR[t]) {
      tokens.add(STATE_ABBR[t]);
      states.add(t);
    }
  }
  // A recognized US state implies the country — otherwise the country-level band
  // can never match, since the patient rarely types out a country. CT.gov reports
  // US sites with country "United States".
  if (states.size > 0) {
    tokens.add("united states");
    tokens.add("usa");
    tokens.add("us");
  }
  return { tokens, states, known: tokens.size > 0 };
}

export type LocLike = { city: string; state: string; country: string };

export function siteLabel(loc: LocLike): string {
  const place = [loc.city, loc.state].filter(Boolean).join(", ");
  return place || loc.country || "Site";
}

/** 4 same city · 3 same state · 2 neighboring state · 1 same country · 0 none.
 *  Approximate by construction — never presented as a distance. */
export function proximity(loc: LocLike, patient: PatientLoc): number {
  if (!patient.known) return 0;
  const city = loc.city.trim().toLowerCase();
  const state = loc.state.trim().toLowerCase();
  const country = loc.country.trim().toLowerCase();

  if (city && patient.tokens.has(city)) return 4;

  const stateName = US_STATES[state] ?? state;
  if (stateName) {
    if (patient.tokens.has(stateName) || (STATE_ABBR[stateName] && patient.tokens.has(STATE_ABBR[stateName]))) return 3;
    for (const home of patient.states) {
      if (ADJACENT[home]?.has(stateName)) return 2;
    }
  }
  if (country && patient.tokens.has(country)) return 1;
  return 0;
}
