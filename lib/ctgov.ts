/* ============================================================================
   Trialign — ClinicalTrials.gov v2 client

   Server-side only. The public v2 API needs no key but does NOT send CORS
   headers, so the browser can't call it directly — everything here runs in a
   Node route handler. We ask for a field allowlist to keep payloads small and
   normalize each study into the app's Trial shape.

   Base + params verified live:
     GET https://clinicaltrials.gov/api/v2/studies
       ?query.cond=breast+cancer
       &filter.overallStatus=RECRUITING
       &pageSize=30
       &fields=<allowlist>
   ========================================================================== */

import type { Trial, TrialLocation, TrialContact } from "./types";

const BASE = "https://clinicaltrials.gov/api/v2/studies";

const FIELDS = [
  "protocolSection.identificationModule",
  "protocolSection.statusModule.overallStatus",
  "protocolSection.statusModule.whyStopped",
  "protocolSection.statusModule.startDateStruct",
  "protocolSection.statusModule.primaryCompletionDateStruct",
  "protocolSection.statusModule.completionDateStruct",
  "protocolSection.statusModule.lastUpdatePostDateStruct",
  "protocolSection.designModule",
  "protocolSection.armsInterventionsModule.interventions",
  "protocolSection.conditionsModule",
  "protocolSection.sponsorCollaboratorsModule.leadSponsor",
  "protocolSection.eligibilityModule",
  "protocolSection.contactsLocationsModule.centralContacts",
  "protocolSection.contactsLocationsModule.locations",
].join(",");

/* ---- study-type scope (intake-prd §4.1) — patient chips → v2 API filter ----
   The chips are patient language, not the CT.gov taxonomy. Each maps to an Essie
   query clause on filter.advanced (AND/OR/AREA[...] — all verified live against
   the v2 API). "Treatment" and "Tests and monitoring" are both INTERVENTIONAL,
   split by primary purpose; observational and expanded access are study types.
   Applied server-side so excluded studies never reach the Claude reasoning pass. */
export type StudyTypeKey = "treatment" | "tests" | "observational" | "expanded";

function studyTypeClause(k: StudyTypeKey): string {
  switch (k) {
    case "treatment":
      return "(AREA[StudyType]INTERVENTIONAL AND AREA[DesignPrimaryPurpose]TREATMENT)";
    case "tests":
      return "(AREA[StudyType]INTERVENTIONAL AND AREA[DesignPrimaryPurpose](DIAGNOSTIC OR SCREENING OR SUPPORTIVE_CARE OR HEALTH_SERVICES_RESEARCH OR DEVICE_FEASIBILITY))";
    case "observational":
      return "AREA[StudyType]OBSERVATIONAL";
    case "expanded":
      return "AREA[StudyType]EXPANDED_ACCESS";
  }
}

/** Build the v2 filter for a study-type selection. Returns the filter.advanced
 *  Essie expression (or null when unfiltered) plus the overallStatus values.
 *  Expanded-access records are AVAILABLE, not RECRUITING, so that chip broadens
 *  the status filter. When both interventional chips are on we collapse to plain
 *  INTERVENTIONAL so interventional studies without a primaryPurpose aren't dropped. */
export function buildStudyTypeFilter(types: StudyTypeKey[]): { advanced: string | null; statuses: string[] } {
  const set = new Set(types);
  const statuses = ["RECRUITING"];
  if (set.has("expanded")) statuses.push("AVAILABLE");
  if (set.size === 0) return { advanced: null, statuses };

  const clauses: string[] = [];
  if (set.has("treatment") && set.has("tests")) clauses.push("AREA[StudyType]INTERVENTIONAL");
  else {
    if (set.has("treatment")) clauses.push(studyTypeClause("treatment"));
    if (set.has("tests")) clauses.push(studyTypeClause("tests"));
  }
  if (set.has("observational")) clauses.push(studyTypeClause("observational"));
  if (set.has("expanded")) clauses.push(studyTypeClause("expanded"));

  return { advanced: clauses.length ? clauses.join(" OR ") : null, statuses };
}

export type SearchOptions = {
  cond: string;
  status?: string; // overrides the study-type-derived status when set
  pageSize?: number; // default 30
  studyTypes?: StudyTypeKey[]; // §4.1 scope; empty/undefined = no study-type filter
  /** Optional location term (city / state / ZIP). Sent as `query.locn`, which
   *  the registry matches against a study's site list. Used ONLY to pull an
   *  ADDITIONAL, location-boosted page that is unioned with the unlocalized
   *  results — never as a filter, so it can raise recall but never lower it. */
  locn?: string;
};

/** Search recruiting trials for a condition and return normalized Trial[]. */
export async function searchTrials(opts: SearchOptions): Promise<Trial[]> {
  const params = new URLSearchParams();
  if (opts.cond) params.set("query.cond", opts.cond);
  if (opts.locn?.trim()) params.set("query.locn", opts.locn.trim());
  const { advanced, statuses } = buildStudyTypeFilter(opts.studyTypes ?? []);
  params.set("filter.overallStatus", opts.status ?? statuses.join(","));
  if (advanced) params.set("filter.advanced", advanced);
  params.set("pageSize", String(opts.pageSize ?? 30));
  params.set("fields", FIELDS);

  const res = await fetch(`${BASE}?${params.toString()}`, {
    headers: { Accept: "application/json" },
    // These change on the registry's cadence, not per user — but we never want
    // a stale cached page to hide a newly recruiting trial. Freshness is the
    // differentiator; always hit the source.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`ClinicalTrials.gov responded ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { studies?: RawStudy[] };
  return (data.studies ?? []).map(normalizeStudy).filter((t): t is Trial => t !== null);
}

/* ---- fetch one study by NCT id (cohort screening, §C1) ----
   The v2 API serves a single study at GET /studies/{nctId} with the same
   `fields=` allowlist as the list endpoint, so we reuse FIELDS and
   normalizeStudy rather than keeping a second copy of either in sync. */

/** An NCT id is "NCT" followed by 8 digits. Reject anything else rather than
 *  forwarding an arbitrary path segment to the registry. */
export function isValidNctId(id: string): boolean {
  return /^NCT\d{8}$/.test(id.trim());
}

/** Fetch and normalize one study by its NCT id. Returns null when the registry
 *  has no such record (404) — a real, expected answer, not an error. Throws on
 *  any other non-OK response, same as searchTrials. */
export async function getTrial(nctId: string): Promise<Trial | null> {
  const id = nctId.trim();
  if (!isValidNctId(id)) {
    throw new Error(`Invalid NCT id: "${nctId}". Expected the form NCT followed by 8 digits.`);
  }

  const params = new URLSearchParams();
  params.set("fields", FIELDS);

  const res = await fetch(`${BASE}/${id}?${params.toString()}`, {
    headers: { Accept: "application/json" },
    // Same reasoning as searchTrials: a stale cached page could hide a status
    // change (a study closing, a criterion amendment) between screenings.
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`ClinicalTrials.gov responded ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as RawStudy;
  return normalizeStudy(data);
}

/* ---- normalization ---- */

// Minimal shapes for the modules we read. Everything is optional because the
// registry omits empty fields.
type RawStudy = {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string };
    statusModule?: {
      overallStatus?: string;
      whyStopped?: string;
      startDateStruct?: { date?: string };
      primaryCompletionDateStruct?: { date?: string };
      completionDateStruct?: { date?: string };
      lastUpdatePostDateStruct?: { date?: string };
    };
    designModule?: {
      studyType?: string;
      phases?: string[];
      designInfo?: {
        allocation?: string; // RANDOMIZED | NON_RANDOMIZED | NA
        interventionModel?: string;
        primaryPurpose?: string; // TREATMENT | DIAGNOSTIC | PREVENTION | …
        maskingInfo?: { masking?: string }; // NONE | SINGLE | DOUBLE | …
      };
      enrollmentInfo?: { count?: number };
    };
    armsInterventionsModule?: { interventions?: { type?: string; name?: string }[] };
    conditionsModule?: { conditions?: string[] };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
    eligibilityModule?: {
      eligibilityCriteria?: string;
      sex?: string;
      minimumAge?: string;
      maximumAge?: string;
      stdAges?: string[];
    };
    contactsLocationsModule?: { centralContacts?: RawContact[]; locations?: RawLocation[] };
  };
};

type RawContact = { name?: string; role?: string; phone?: string; email?: string };

type RawLocation = {
  facility?: string;
  city?: string;
  state?: string;
  country?: string;
  status?: string;
  contacts?: RawContact[];
};

/* ---- site-level recruiting status ----
   A study's overallStatus is RECRUITING while individual sites can be WITHDRAWN,
   SUSPENDED, TERMINATED, COMPLETED, or NOT_YET_RECRUITING. Showing one of those
   as "your nearest site" sends a patient to a door that is shut, so every
   proximity decision keys off THIS predicate, not off the study status.
   The registry omits `status` on many location records; an omitted status is
   treated as open (we inherit the study's RECRUITING) rather than hidden. */
const SITE_OPEN = new Set(["RECRUITING", "AVAILABLE", "ENROLLING_BY_INVITATION", ""]);

export function siteIsRecruiting(loc: { status: string }): boolean {
  return SITE_OPEN.has((loc.status ?? "").trim().toUpperCase());
}

/* ---- site status, in words ----
   Same registry values as SITE_OPEN above, but for a screen a patient reads
   right before dialing a number — "NOT_YET_RECRUITING" reads like a filter
   value, not a sentence. This only changes how a status is written, never
   whether it counts as open; siteIsRecruiting stays the one predicate for that. */
const SITE_STATUS_WORDS: Record<string, string> = {
  RECRUITING: "Recruiting",
  AVAILABLE: "Available",
  ENROLLING_BY_INVITATION: "Enrolling by invitation",
  NOT_YET_RECRUITING: "Not yet recruiting",
  ACTIVE_NOT_RECRUITING: "Active, not recruiting",
  SUSPENDED: "Suspended",
  TERMINATED: "Terminated",
  WITHDRAWN: "Withdrawn",
  COMPLETED: "Completed",
  UNKNOWN: "Status unknown",
};

export function formatSiteStatus(status: string): string {
  const key = (status ?? "").trim().toUpperCase();
  if (!key) return "";
  return SITE_STATUS_WORDS[key] ?? titleCase(key.replace(/_/g, " "));
}

/* ---- cap-safe ordering for the referral screen ----
   The contact screen caps how many sites it prints (each one is taller now that
   it can carry its own contacts). Locations arrive nearest-first; this moves
   every open site ahead of every closed one, WITHOUT reordering within either
   group, so a farther-but-open site is never bumped out of the cap by a
   nearer site nobody there can actually enroll a patient into. */
export function prioritizeOpenSites<T extends { status: string }>(locations: readonly T[]): T[] {
  const open: T[] = [];
  const closed: T[] = [];
  for (const loc of locations) (siteIsRecruiting(loc) ? open : closed).push(loc);
  return [...open, ...closed];
}

function normalizeContact(c: RawContact): TrialContact {
  return { name: c.name ?? "", role: c.role ?? "", phone: c.phone ?? "", email: c.email ?? "" };
}
/** Keep only contacts a patient could actually use to reach out. */
function usableContacts(list?: RawContact[]): TrialContact[] {
  return (list ?? []).map(normalizeContact).filter((c) => c.name && (c.phone || c.email));
}

function normalizeStudy(study: RawStudy): Trial | null {
  const p = study.protocolSection;
  const id = p?.identificationModule;
  if (!id?.nctId) return null;

  const locations: TrialLocation[] = (p?.contactsLocationsModule?.locations ?? []).map((l) => ({
    facility: l.facility ?? "",
    city: l.city ?? "",
    state: l.state ?? "",
    country: l.country ?? "",
    status: l.status ?? "",
    contacts: usableContacts(l.contacts),
  }));

  const design = p?.designModule;
  const info = design?.designInfo;
  const studyTypeUpper = (design?.studyType ?? "").toUpperCase();
  const masking = (info?.maskingInfo?.masking ?? "").toUpperCase();
  const interventions = (p?.armsInterventionsModule?.interventions ?? [])
    .map((i) => ({ type: titleCase(i.type ?? ""), name: (i.name ?? "").trim() }))
    .filter((i) => i.name);

  return {
    nctId: id.nctId,
    title: id.briefTitle ?? "(untitled study)",
    officialTitle: id.officialTitle ?? "",
    phase: formatPhases(design?.phases),
    studyType: titleCase(design?.studyType ?? ""),
    overallStatus: p?.statusModule?.overallStatus ?? "",
    whyStopped: p?.statusModule?.whyStopped ?? "",
    sponsor: p?.sponsorCollaboratorsModule?.leadSponsor?.name ?? "—",
    conditions: p?.conditionsModule?.conditions ?? [],
    eligibilityCriteria: p?.eligibilityModule?.eligibilityCriteria ?? "",
    sex: p?.eligibilityModule?.sex ?? "",
    minimumAge: p?.eligibilityModule?.minimumAge ?? "",
    maximumAge: p?.eligibilityModule?.maximumAge ?? "",
    stdAges: p?.eligibilityModule?.stdAges ?? [],
    locations,
    url: `https://clinicaltrials.gov/study/${id.nctId}`,
    startDate: p?.statusModule?.startDateStruct?.date ?? "",
    primaryCompletionDate: p?.statusModule?.primaryCompletionDateStruct?.date ?? "",
    completionDate: p?.statusModule?.completionDateStruct?.date ?? "",
    lastUpdatePostDate: p?.statusModule?.lastUpdatePostDateStruct?.date ?? "",
    registry: "ClinicalTrials.gov",
    contacts: usableContacts(p?.contactsLocationsModule?.centralContacts),
    randomized: (info?.allocation ?? "").toUpperCase() === "RANDOMIZED",
    masked: masking !== "" && masking !== "NONE",
    primaryPurpose: titleCase(info?.primaryPurpose ?? ""),
    interventional: studyTypeUpper === "INTERVENTIONAL",
    enrollment: design?.enrollmentInfo?.count ?? 0,
    interventions,
  };
}

function formatPhases(phases?: string[]): string {
  if (!phases || phases.length === 0) return "N/A";
  const map = (ph: string): string => {
    switch (ph) {
      case "NA":
        return "N/A";
      case "EARLY_PHASE1":
        return "Early Phase 1";
      case "PHASE1":
        return "Phase 1";
      case "PHASE2":
        return "Phase 2";
      case "PHASE3":
        return "Phase 3";
      case "PHASE4":
        return "Phase 4";
      default:
        return titleCase(ph.replace(/_/g, " "));
    }
  };
  // Registry lists combined phases as separate entries (e.g. ["PHASE1","PHASE2"]).
  const labels = phases.map(map);
  if (labels.length === 2 && labels[0].startsWith("Phase") && labels[1].startsWith("Phase")) {
    return `Phase ${labels[0].split(" ")[1]}/${labels[1].split(" ")[1]}`;
  }
  return labels.join(", ");
}

export function titleCase(s: string): string {
  if (!s) return s;
  return s
    .toLowerCase()
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
