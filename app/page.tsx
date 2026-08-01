"use client";

/* ============================================================================
   Trialign — patient-first client state machine

   Portal home + landing are the front door (top header + portal tabs). Once the
   patient enters the flow, the app switches to a Claude-desktop-style workspace
   shell (persistent left sidebar + main board):

     home → landing → capture(extract) → survey(preferences) →
     clarify(AI gaps, if any) → review(+consent) → reason → results

   The criterion ledger stays the signature and the evidence; the decision brief,
   preferences, and geography grouping are the patient-facing decision layer.
   ========================================================================== */

import { memo, useEffect, useRef, useState } from "react";
import AgentAvatar from "@/app/components/AgentAvatar";
import TrialLogo from "@/app/components/TrialLogo";
import AsciiBackground from "@/app/components/AsciiBackground";
import HeroVideo from "@/app/components/HeroVideo";
import NavAuth from "@/app/components/NavAuth";
import ProductCarousel from "@/app/components/ProductCarousel";
import type { TrialMatch, Criterion, Verdict, MatchStatus } from "@/lib/types";
import { deriveStatus, metCountOf, hardFailCountOf, openCountOf, compareMatches, splitNearMisses } from "@/lib/verdict";
import { siteIsRecruiting, formatSiteStatus, prioritizeOpenSites, titleCase } from "@/lib/ctgov";
import { buildDisclosureRecord, recordDisclosure, type DisclosureOutcome } from "@/lib/disclosure";

/* ---- API response shapes ---- */
type FieldSource = "fhir" | "note" | "you";
type ProfileField = { label: string; value: string; clinical: boolean; gap: boolean; mcode: string; source: FieldSource };
type Clarification = { id: string; question: string; rationale: string; gloss: string; options: string[] };
type Profile = {
  conditionQuery: string;
  /** Extra condition terms the extractor proposed; unioned with conditionQuery
   *  at search time so a study registered under a synonym or a broader umbrella
   *  is still reachable. */
  conditionQueries?: string[];
  summary: string;
  fields: ProfileField[];
  clarifications: Clarification[];
};
type Counts = {
  poolTotal: number;
  reasoned: number;
  eligible: number;
  uncertain: number;
  near: number;
  screened: number;
  /** Ruled out by a deterministic structural gate (age band, sex) before any
   *  model call. Reported, never hidden. */
  excluded: number;
};
/** How the candidate pool was assembled — one entry per search term, so the
 *  coverage of a search is inspectable rather than implied by a single number. */
type Coverage = { terms: { term: string; added: number; error: string | null }[]; triaged: boolean };
/** One re-judged criterion coming back from /api/reconfirm. `remediable` is
 *  optional so an older response shape still applies cleanly. */
type Reverdict = { verdict: Verdict; evidence: string; remediable?: boolean };
type LocationInfo = { applied: boolean; label: string; travel: TravelPref | null; inRange: number };
type MatchResponse = {
  /** "curated-demo" = the sample-patient fixture, with hand-authored ledgers and
   *  no model call. The screen must not describe those as AI-generated, and must
   *  not report a live screen that never ran — they are attached to real NCT ids
   *  and real sponsors. Absent (older shape) is treated as live. */
  provenance?: "live" | "curated-demo";
  conditionQuery: string;
  summary: string;
  counts: Counts;
  coverage?: Coverage;
  location: LocationInfo;
  matches: TrialMatch[];
};

type PortalMode = "patient" | "clinician" | "partner";
type Phase = "home" | "landing" | "connect" | "capture" | "clarify" | "confirm" | "reason" | "results" | "fork" | "refer";

/* Audit D7 — the demo interstitial's pending action. A data-ingestion attempt
   (note submit, PDF pick, or entering the Connect flow) is stashed here while the
   blocking DemoGate is shown, then replayed verbatim once the user acknowledges. */
type GateAction = { kind: "note" } | { kind: "pdf"; file: File } | { kind: "connect" };

/* ---- record-import (SMART on FHIR) shapes ---- */
type ConnectPatient = { id: string; label: string; summary: string };
type ConnectList = { base: string; live: ConnectPatient[]; liveError: string | null; bundled: ConnectPatient[] };
type ImportOrigin = "note" | "fhir";

/* ---- the Fork (intake-prd §6) shapes ---- */
type ForkOptionKind = "treatment" | "all" | "other";
type ForkOption = { id: string; label: string; drugClass: string; rationale: string; kind: ForkOptionKind };
type ForkDoor = { nctId: string; door: "stays_open" | "closes" | "confirm"; criterion: string; kind: "incl" | "excl"; reason: string };
type ForkResult = { optionId: string; optionLabel: string; doors: ForkDoor[] };

/* §6.4 — required verbatim on every Fork payoff view that shows a closing door.
   The failure mode we must never enable is a patient delaying standard-of-care
   to preserve trial eligibility. Non-negotiable. */
const FORK_DISCLAIMER =
  "This is not medical advice, and it is not a reason to change your treatment plan. Treatment decisions belong with your oncologist. This shows you which trial options are time-sensitive so you can raise them at your next appointment.";

/* Phases that render inside the workspace shell (sidebar + main). */
const SHELL_PHASES: Phase[] = ["capture", "clarify", "confirm", "reason", "results", "fork", "refer"];

const PORTAL_MODES: [PortalMode, string][] = [
  ["patient", "Patient"],
  ["clinician", "Clinician"],
  ["partner", "Partners"],
];
const MODE_BADGE: Record<PortalMode, string> = { patient: "patient", clinician: "clinician", partner: "partners" };

/* ---- scope: travel band + location (relocated into the Capture chip row) ---- */
type TravelPref = "local" | "regional" | "any";
type SurveyPrefs = { travel: TravelPref | null; location: string };
const EMPTY_SURVEY: SurveyPrefs = { travel: null, location: "" };

/* A distance preference (anything but "any") requires an entered location. */
function travelNeedsLocation(t: TravelPref | null): boolean {
  return t === "local" || t === "regional";
}

/* ---- study-type scope chips (intake-prd §4.1) — patient language, NOT the
   CT.gov taxonomy. Multi-select; treatment + tests default ON, the rest OFF.
   Threaded to /api/match and applied at the registry BEFORE the reasoning pass,
   so excluded study types never consume a Claude call. */
type StudyTypeKey = "treatment" | "tests" | "observational" | "expanded";
const STUDY_TYPE_CHIPS: { key: StudyTypeKey; label: string; hint: string }[] = [
  { key: "treatment", label: "Treatment studies", hint: "testing a new drug or therapy for my cancer" },
  { key: "tests", label: "Tests & monitoring", hint: "new ways to detect, measure, or track my cancer" },
  { key: "observational", label: "Observational", hint: "no new treatment; my data helps future patients" },
  { key: "expanded", label: "Expanded access", hint: "access to a drug outside a trial (compassionate use)" },
];
const DEFAULT_STUDY_TYPES: StudyTypeKey[] = ["treatment", "tests"];

/* Travel bands are commitment bands, not mileage bands (§4.2). */
const TRAVEL_BANDS: { value: TravelPref; label: string }[] = [
  { value: "local", label: "Local only" },
  { value: "regional", label: "Within a few hours" },
  { value: "any", label: "Anywhere for the right trial" },
];

/* ---- "Who's filling this out?" (§5.3) — one click, defaults to Patient, never
   gates progress. Changes the output voice only; not an eligibility question. */
type Entrant = "patient" | "caregiver" | "clinician";
const ENTRANTS: { value: Entrant; label: string }[] = [
  { value: "patient", label: "Patient" },
  { value: "caregiver", label: "Family / caregiver" },
  { value: "clinician", label: "Clinician" },
];

/* §8 — Confirm echoes the scope the search will run with, built from real state
   (study-type chips + travel band + location), never hardcoded. */
function scopeSummary(types: Set<StudyTypeKey>, survey: SurveyPrefs): string {
  const labels = STUDY_TYPE_CHIPS.filter((c) => types.has(c.key)).map((c) => c.label.toLowerCase());
  const studyPart = labels.length ? labels.join(" + ") : "all study types";
  const loc = survey.location.trim();
  const band = survey.travel ? TRAVEL_BANDS.find((b) => b.value === survey.travel)?.label.toLowerCase() : "";
  let rankPart: string;
  if (loc) rankPart = `ranked for ${loc}${band ? ` (${band})` : ""}`;
  else if (band) rankPart = `ranked ${band}`;
  else rankPart = "ranked by fit";
  return `Searching ${studyPart}, ${rankPart}`;
}

/* results filters */
type StudyFilter = "all" | "treatment" | "observational";
type StatusFilter = "all" | MatchStatus;
type TopK = 10 | 25 | "all";

/* sidebar step tracker */
const STEPS: { key: "note" | "review" | "matches" | "fork"; label: string }[] = [
  { key: "note", label: "Your note" },
  { key: "review", label: "Review" },
  { key: "matches", label: "Matches" },
  { key: "fork", label: "What's next" },
];
function stepKey(phase: Phase): "note" | "review" | "matches" | "fork" {
  if (phase === "capture") return "note";
  if (phase === "clarify" || phase === "confirm") return "review";
  if (phase === "fork") return "fork";
  return "matches";
}

const SAMPLE_NOTE = `61F, ECOG 1. HR-positive (ER 90%, PR 60%), HER2-negative (IHC 1+) metastatic breast ca, stage IV. 1L letrozole+palbociclib (3/2024) → PD 12/2025. 2L fulvestrant (1/2026) → PD 6/2026. Trial of pembrolizumab on a prior protocol. PIK3CA H1047R+, BRCA wt. Boston MA.`;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

/* §5.2 — the NGS clarify answer (id "ngs-status") turns a dead end into an action.
   Show the Results banner only when the patient answered no / not sure. */
function ngsActionNeeded(answers: Record<string, string>): boolean {
  const a = (answers["ngs-status"] ?? "").toLowerCase();
  if (!a || a.includes("yes")) return false;
  return a.includes("no") || a.includes("not sure");
}

/* ---- provenance (record-import-prd §7.1): label every field FHIR · note · you.
   Connect §3 adds a 4th value for criteria: "not documented" (nothing on record). ---- */
type BadgeSource = FieldSource | "not_documented";
const SOURCE_META: Record<BadgeSource, { label: string; hint: string }> = {
  fhir: { label: "FHIR", hint: "Structured data pulled from your chart via SMART on FHIR" },
  note: { label: "note", hint: "Read from a clinical note or document" },
  you: { label: "you told us", hint: "You told us this / edited it here" },
  not_documented: { label: "not documented", hint: "Nothing in your record addresses this yet" },
};
function SourceBadge({ source }: { source: BadgeSource }) {
  const m = SOURCE_META[source] ?? SOURCE_META.note;
  return (
    <span className={`srcbadge ${source}`} title={m.hint}>
      {m.label}
    </span>
  );
}
function ProvenanceLegend({ schema = false }: { schema?: boolean }) {
  return (
    <div className="prov-legend" aria-label="How to read the source labels">
      {schema && (
        <div className="prov-legend__schema">
          <span className="prov-legend__chip">mCODE / USCDI+ CTM</span>
          <span>
            Mapped to the federal Cancer Clinical Trials Matching schema (<b>mCODE 4.0.0 / US Core 6.1.0</b>). Every field is labeled with its
            source below.
          </span>
        </div>
      )}
      <span className="prov-legend__h">Sources</span>
      {(["fhir", "note", "you"] as FieldSource[]).map((s) => (
        <span key={s} className="prov-legend__item">
          <SourceBadge source={s} /> {SOURCE_META[s].hint}
        </span>
      ))}
    </div>
  );
}

export default function Page() {
  const [phase, setPhase] = useState<Phase>("home");
  const [portalMode, setPortalMode] = useState<PortalMode>("patient");
  const [note, setNote] = useState("");
  const [origin, setOrigin] = useState<ImportOrigin>("note");
  // Friendly label for the capture screen when the input isn't a raw note
  // (a FHIR patient name, or an uploaded file name) — the note itself may be a
  // long composed FHIR document we don't want to dump on screen.
  const [sourceLabel, setSourceLabel] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [match, setMatch] = useState<MatchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Scope (§4.1/§4.2): study-type chips + travel band + location. Set on the
  // Capture/Landing chip row BEFORE the note is read, so they must survive the
  // per-note reset — only a brand-new search resets them to defaults.
  const [studyTypes, setStudyTypes] = useState<Set<StudyTypeKey>>(new Set(DEFAULT_STUDY_TYPES));
  const [survey, setSurvey] = useState<SurveyPrefs>(EMPTY_SURVEY);
  const [entrant, setEntrant] = useState<Entrant>("patient"); // §5.3 — output voice only
  // Connect (referral) stage — which trial is being prepared, and a Fork summary
  // to carry into Packet A ("Starting X would close N of your M open trials").
  const [referTrial, setReferTrial] = useState<string | null>(null);
  const [forkNote, setForkNote] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [prefs, setPrefs] = useState<Set<PrefKey>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [studyFilter, setStudyFilter] = useState<StudyFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [phaseFilter, setPhaseFilter] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState<TopK>(10);
  const [flash, setFlash] = useState<string | null>(null);
  // Resolving a "confirm": the background re-check of other trials, and the
  // "Your next steps" panel for when the patient doesn't have the info yet.
  const [recheck, setRecheck] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null });
  const [showNextSteps, setShowNextSteps] = useState(false);
  // true only when the "Try a sample patient (Margaret)" chip was used — routes
  // /api/match to the deterministic demo result (lib/demoMatch).
  const [demoSample, setDemoSample] = useState(false);
  // Audit D7 — blocking demo interstitial. `demoAcked` is per-session React state
  // ONLY (never persisted → a refresh re-arms the gate); `gate` holds the pending
  // ingestion action while the modal is up. A mirror ref lets the resume path read
  // the acknowledgment synchronously, before React commits the state update.
  const [demoAcked, setDemoAcked] = useState(false);
  const demoAckedRef = useRef(false);
  const [gate, setGate] = useState<GateAction | null>(null);

  const appRef = useRef<HTMLDivElement>(null);

  // load persisted theme once (localStorage, trial: prefix)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("trial:theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("trial:theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Keep the synchronous mirror in step with the acknowledgment state. The resume
  // path also sets the ref directly (so a same-tick replay clears its gate check);
  // this effect is the durable source-of-truth sync for every other render.
  useEffect(() => {
    demoAckedRef.current = demoAcked;
  }, [demoAcked]);

  /* ---- transitions ---- */

  function resetIntake() {
    setNote("");
    setOrigin("note");
    setSourceLabel("");
    setDemoSample(false);
    setProfile(null);
    setAnswers({});
    setStep(0);
    setMatch(null);
    setError(null);
    // NB: scope (studyTypes / survey) is intentionally NOT reset here — it's
    // captured on the chip row before the note and must carry into this run.
    setConsent(false);
    setPrefs(new Set());
    setSaved(new Set());
    setStudyFilter("all");
    setStatusFilter("all");
    setPhaseFilter(new Set());
    setQuery("");
    setTopK(10);
  }

  // Shared extraction call: text (a note or a composed FHIR document) → profile.
  // Does not touch phase/reset — the entry handlers own that.
  async function extractInto(text: string, o: ImportOrigin) {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: text, origin: o }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Extraction failed.");
    setProfile(data.profile as Profile);
  }

  // Paste / describe path — the universal funnel every text entry point uses.
  async function readNote(text: string, demo = false) {
    const t = text.trim();
    if (!t) return;
    // Audit D7 — choke point: no /api/extract call may fire before the gate is
    // acknowledged. The sample path (demo === true) is synthetic by construction
    // and is the safe exit we steer to, so it bypasses.
    if (!demo && !demoAckedRef.current) {
      setGate({ kind: "note" });
      return;
    }
    resetIntake();
    setDemoSample(demo);
    setNote(t);
    setPhase("capture");
    setBusy(true);
    try {
      await extractInto(t, "note");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // Upload PDF path — wire the previously-orphaned /api/upload-pdf route: extract
  // text server-side, then run the same extraction as a note.
  async function readPdf(file: File) {
    // Audit D7 — choke point: stash the File and gate before /api/upload-pdf.
    if (!demoAckedRef.current) {
      setGate({ kind: "pdf", file });
      return;
    }
    resetIntake();
    setSourceLabel(file.name);
    setPhase("capture");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/upload-pdf", { method: "POST", body: fd });
      const upd = await up.json();
      if (!up.ok) throw new Error(upd.error || "Could not read that PDF.");
      setNote(upd.text as string);
      await extractInto(upd.text as string, "note");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // Connect-my-records path — pull the patient's chart (SMART on FHIR), then feed
  // the composed document into the same extractor. The moat: FHIR resources + the
  // DocumentReference notes both flow through /api/extract.
  async function readRecords(src: "live" | "bundled", id: string, label: string) {
    resetIntake();
    setOrigin("fhir");
    setSourceLabel(label);
    setPhase("capture");
    setBusy(true);
    try {
      const res = await fetch("/api/connect-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: src, id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Record import failed.");
      const doc = data.document as string;
      const meta = data.meta as { patientLabel?: string; counts?: Record<string, number>; hasNotes?: boolean };
      setNote(doc);
      if (meta?.patientLabel) setSourceLabel(meta.patientLabel);
      await extractInto(doc, "fhir");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // Retry re-runs extraction against whatever text/document is already loaded
  // (works for note, pdf, and fhir — the source text is retained in `note`).
  async function retryExtract() {
    setError(null);
    setBusy(true);
    try {
      await extractInto(note, origin);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // Patient corrects a value on the Confirm screen → it becomes "you told us"
  // (provenance flips to `you`), the honest basis for that field going forward.
  function editField(index: number, value: string) {
    setProfile((p) =>
      p ? { ...p, fields: p.fields.map((f, i) => (i === index ? { ...f, value, source: "you" as FieldSource } : f)) } : p,
    );
  }

  // Capture → the review flow. Scope now lives on the chip row (no survey step),
  // so this just advances: a short AI clarify only if the note left genuine gaps.
  function afterCapture() {
    if (profile && profile.clarifications.length > 0) {
      setStep(0);
      setPhase("clarify");
    } else {
      setPhase("confirm");
    }
  }

  function answer(value: string) {
    if (!profile) return;
    const c = profile.clarifications[step];
    setAnswers((a) => ({ ...a, [c.id]: value }));
    const next = step + 1;
    if (next >= profile.clarifications.length) setPhase("confirm");
    else setStep(next);
  }

  async function findTrials() {
    if (!profile || !consent) return;
    setError(null);
    // Seed the results ranking from the travel band — this is what makes the
    // distance preference bite (it ranks/groups; it never hard-filters).
    const seeded = new Set<PrefKey>();
    if (survey.travel && survey.travel !== "any") seeded.add("near");
    setPrefs(seeded);
    setPhase("reason");
    setBusy(true);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conditionQuery: profile.conditionQuery,
          conditionQueries: profile.conditionQueries ?? [],
          summary: profile.summary,
          fields: profile.fields.map((f) => ({ label: f.label, value: f.value })),
          location: survey.location.trim(),
          travel: survey.travel,
          studyTypes: Array.from(studyTypes),
          entrant,
          demo: demoSample ? "margaret" : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Matching failed.");
      setMatch(data as MatchResponse);
      setPhase("results");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- resolving a "confirm" to-do -------------------------------------------
  // The patient supplies the missing fact for one criterion. We (1) save it to the
  // shared profile as told-by-you, (2) re-judge that one criterion honestly, and
  // (3) re-check every OTHER reasoned trial's open items against the new fact in the
  // background. Returns true on success so the row can collapse; throws on failure
  // so the row can show the error inline (and stay open as a to-do).
  async function resolveCriterion(nctId: string, critIndex: number, answer: string): Promise<boolean> {
    if (!match || !profile) return false;
    const trial = match.matches.find((m) => m.nctId === nctId);
    const crit = trial?.criteria[critIndex];
    if (!trial || !crit) return false;

    // 1. Persist to the shared profile (provenance "you") so it carries forward.
    const field: ProfileField = {
      label: confirmFieldLabel(crit.requirement),
      value: answer,
      clinical: false,
      gap: false,
      mcode: "",
      source: "you",
    };
    const updatedProfile: Profile = { ...profile, fields: [...profile.fields, field] };
    setProfile(updatedProfile);

    // 2. Re-judge just this criterion with the added info.
    const res = await fetch("/api/reconfirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: { summary: updatedProfile.summary, fields: updatedProfile.fields.map((f) => ({ label: f.label, value: f.value })) },
        trial: { nctId: trial.nctId, title: trial.title, phase: trial.phase },
        criteria: [{ kind: crit.kind, requirement: crit.requirement, evidence: crit.evidence, remediable: crit.remediable }],
        answer,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't update this item.");
    const nv = (data.verdicts?.[0] ?? null) as Reverdict | null;
    if (!nv) throw new Error("No verdict returned.");

    setMatch((prev) => applyReverdicts(prev, nctId, [critIndex], [nv]));
    setFlash(nctId);
    window.setTimeout(() => setFlash((f) => (f === nctId ? null : f)), 1400);

    // 3. Fire-and-forget: re-check the other reasoned trials' open items.
    void backgroundRecheck(nctId, updatedProfile);
    return true;
  }

  async function backgroundRecheck(sourceNctId: string, updatedProfile: Profile) {
    if (!match) return;
    const targets = match.matches.filter((m) => m.nctId !== sourceNctId && m.criteria.some((c) => c.verdict === "confirm"));
    if (targets.length === 0) return;
    setRecheck({ busy: true, note: `Re-checking ${targets.length} other trial${targets.length > 1 ? "s" : ""} with your new info…` });

    let changed = 0;
    await runBounded(targets, 4, async (t) => {
      const open = t.criteria.map((c, i) => ({ c, i })).filter((x) => x.c.verdict === "confirm");
      try {
        const res = await fetch("/api/reconfirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile: { summary: updatedProfile.summary, fields: updatedProfile.fields.map((f) => ({ label: f.label, value: f.value })) },
            trial: { nctId: t.nctId, title: t.title, phase: t.phase },
            criteria: open.map((x) => ({ kind: x.c.kind, requirement: x.c.requirement, evidence: x.c.evidence, remediable: x.c.remediable })),
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const verdicts = (data.verdicts ?? []) as Reverdict[];
        changed += open.reduce((n, _x, k) => n + (verdicts[k] && verdicts[k].verdict !== "confirm" ? 1 : 0), 0);
        setMatch((prev) =>
          applyReverdicts(
            prev,
            t.nctId,
            open.map((x) => x.i),
            verdicts,
          ),
        );
      } catch {
        /* leave this trial's items unchanged on error — never invent a resolution */
      }
    });

    setRecheck({
      busy: false,
      note:
        changed > 0
          ? `Updated ${changed} open item${changed > 1 ? "s" : ""} on other trials from your new info.`
          : "Checked other trials — your new info didn't resolve any of their open items.",
    });
  }

  const togglePref = (k: PrefKey) =>
    setPrefs((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const toggleSave = (nct: string) =>
    setSaved((s) => {
      const n = new Set(s);
      if (n.has(nct)) n.delete(nct);
      else n.add(nct);
      return n;
    });
  const togglePhase = (p: string) =>
    setPhaseFilter((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  // Re-open a saved trial from the left menu: clear any result filters that could
  // be hiding it, then scroll its card into view and flash it once it's rendered.
  function openSaved(nct: string) {
    setStatusFilter("all");
    setStudyFilter("all");
    setPhaseFilter(new Set());
    setQuery("");
    setTopK("all");
    setFlash(nct);
    setTimeout(() => {
      document.getElementById(`trial-${nct}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    setTimeout(() => setFlash((f) => (f === nct ? null : f)), 1600);
  }

  // A brand-new search is the only place scope resets to its defaults.
  function resetScope() {
    setStudyTypes(new Set(DEFAULT_STUDY_TYPES));
    setSurvey(EMPTY_SURVEY);
    setEntrant("patient");
  }
  const toggleStudyType = (k: StudyTypeKey) =>
    setStudyTypes((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  function goHome() {
    setPhase("home");
    resetIntake();
    resetScope();
  }
  function newSearch() {
    resetIntake();
    resetScope();
    setPhase("landing");
  }
  function selectMode(mode: PortalMode) {
    setPortalMode(mode);
    if (mode !== "patient" && phase !== "home") goHome();
  }
  function enterPortal() {
    if (portalMode === "patient") setPhase("landing");
  }

  /* ---- Audit D7 — demo gate ---- */
  // Entering the Connect flow is itself an ingestion path (the sandbox listing
  // fetch fires on mount), so gate the navigation, not just readRecords.
  function enterConnect() {
    if (!demoAckedRef.current) {
      setGate({ kind: "connect" });
      return;
    }
    setPhase("connect");
  }
  // "Continue with a synthetic note": acknowledge, close, and replay the stashed
  // action. The ref flips synchronously so the replayed handler clears its gate
  // check in this same tick (React's demoAcked commit lags a render behind).
  function ackAndResume() {
    const pending = gate;
    demoAckedRef.current = true;
    setDemoAcked(true);
    setGate(null);
    if (!pending) return;
    if (pending.kind === "note") void readNote(note);
    else if (pending.kind === "pdf") void readPdf(pending.file);
    else setPhase("connect");
  }
  // "Use the sample patient (Margaret)": discard the stashed action and run the
  // sample flow. Deliberately does NOT set demoAcked — using the sample doesn't
  // license real-note entry, so the gate re-arms if they then try their own note.
  function gateSample() {
    setGate(null);
    void readNote(SAMPLE_NOTE, true);
  }

  /* ---- top header (home + landing only) ---- */
  const header = (
    <div className="top">
      <div className="top-left">
        <button type="button" className="brand brand-btn" onClick={goHome}>
          <TrialLogo />
          Trialign <small>{MODE_BADGE[portalMode]}</small>
        </button>
      </div>
      <div className="mode-switch" role="tablist" aria-label="Portal mode">
        {PORTAL_MODES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={portalMode === id}
            className={`mode-switch__btn${portalMode === id ? " on" : ""}`}
            onClick={() => selectMode(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="top-right">
        <NavAuth portalMode={portalMode} />
      </div>
    </div>
  );

  const inShell = SHELL_PHASES.includes(phase);

  return (
    <div className="app" ref={appRef}>
      {/* front-landing hero uses a video backdrop (HeroVideo) instead of the
          ASCII; keep the ASCII app-wide everywhere else */}
      {phase !== "home" && <AsciiBackground trackRef={appRef} />}

      {inShell ? (
        <div className="shell">
          <Sidebar
            phase={phase}
            profile={profile}
            theme={theme}
            onTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            onHome={goHome}
            onNewSearch={newSearch}
            showControls={phase === "results"}
            prefs={prefs}
            onTogglePref={togglePref}
            studyFilter={studyFilter}
            onStudyFilter={setStudyFilter}
            query={query}
            onQuery={setQuery}
            phaseFilter={phaseFilter}
            onTogglePhase={togglePhase}
            topK={topK}
            onTopK={setTopK}
            saved={saved}
            onToggleSave={toggleSave}
            onOpenSaved={openSaved}
            matches={match?.matches ?? []}
          />
          <div className="shell-main">
            {phase === "capture" && (
              <Capture
                note={note}
                origin={origin}
                sourceLabel={sourceLabel}
                profile={profile}
                busy={busy}
                error={error}
                onRetry={retryExtract}
                onContinue={afterCapture}
              />
            )}
            {phase === "clarify" && profile && (
              <Clarify profile={profile} step={step} onAnswer={answer} onBack={() => step > 0 && setStep(step - 1)} onSkip={() => answer("(skipped — flagged uncertain)")} />
            )}
            {phase === "confirm" && profile && (
              <Review
                profile={profile}
                answers={answers}
                consent={consent}
                onConsent={setConsent}
                onFind={findTrials}
                onEditField={editField}
                scopeLine={scopeSummary(studyTypes, survey)}
              />
            )}
            {phase === "reason" && <Reason busy={busy} error={error} onRetry={findTrials} />}
            {phase === "results" && match && (
              <Results
                data={match}
                entrant={entrant}
                prefs={prefs}
                saved={saved}
                onToggleSave={toggleSave}
                studyFilter={studyFilter}
                statusFilter={statusFilter}
                onStatusFilter={setStatusFilter}
                phaseFilter={phaseFilter}
                query={query}
                topK={topK}
                flash={flash}
                onResolve={resolveCriterion}
                recheck={recheck}
                onDismissRecheck={() => setRecheck((r) => ({ ...r, note: null }))}
                onOpenNextSteps={() => setShowNextSteps(true)}
                onOpenFork={() => setPhase("fork")}
                onRefer={(nctId) => {
                  setReferTrial(nctId);
                  setPhase("refer");
                }}
                showNgsAction={ngsActionNeeded(answers)}
              />
            )}
            {phase === "fork" && match && profile && (
              <Fork
                profile={profile}
                matches={match.matches}
                location={match.location}
                onForkNote={setForkNote}
                onBack={() => setPhase("results")}
              />
            )}
            {phase === "refer" &&
              match &&
              profile &&
              (() => {
                const t = match.matches.find((m) => m.nctId === referTrial);
                return t ? (
                  <Refer trial={t} profile={profile} onBack={() => setPhase("results")} />
                ) : null;
              })()}
          </div>
          {showNextSteps && match && (
            <NextStepsPanel
              matches={match.matches}
              onClose={() => setShowNextSteps(false)}
              onRefer={(nctId) => {
                setShowNextSteps(false);
                setReferTrial(nctId);
                setPhase("refer");
              }}
            />
          )}
        </div>
      ) : (
        <>
          {header}
          <div className="app-main">
            {phase === "home" && <Home mode={portalMode} onEnter={enterPortal} onSelectPatient={() => selectMode("patient")} />}
            {phase === "landing" && (
              <Landing
                note={note}
                setNote={setNote}
                onRead={readNote}
                onSample={() => readNote(SAMPLE_NOTE, true)}
                onPdf={readPdf}
                onConnect={enterConnect}
                studyTypes={studyTypes}
                onToggleStudyType={toggleStudyType}
                survey={survey}
                onSurvey={setSurvey}
                entrant={entrant}
                onEntrant={setEntrant}
              />
            )}
            {phase === "connect" && (
              <Connect onPick={readRecords} onBack={() => setPhase("landing")} />
            )}
            <AppFooter theme={theme} onTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} />
          </div>
        </>
      )}

      {/* Audit D7 — blocking demo interstitial. Shown the moment an ingestion path
          is attempted before acknowledgment; the only exits are its two buttons. */}
      {gate && <DemoGate onSample={gateSample} onContinue={ackAndResume} />}
    </div>
  );
}

/* ============================ demo gate (Audit D7) ======================== */

/* Blocking interstitial enforced at the data-flow choke point: it is the first
   thing any real note / PDF / record-connect attempt hits, so no health data
   reaches /api/extract before this consent moment. Deliberately NOT dismissible
   — no backdrop-click, no Escape, no ✕. The only ways out are its two buttons,
   and the primary steers to the safe synthetic sample. */
function DemoGate({ onSample, onContinue }: { onSample: () => void; onContinue: () => void }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="gate-overlay" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate-panel">
        <div className="gate-head">
          <div className="demo-badge">DEMO · SYNTHETIC DATA ONLY</div>
          <h2 id="gate-title">This is a demo — synthetic data only</h2>
        </div>
        <div className="gate-body">
          <p>
            This build is for demonstration. <b>Please do not enter real patient information.</b> Anything you enter is processed by an AI service
            to generate trial matches, and is not stored by Trial.
          </p>
          <label className="consent gate-consent">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              I understand, and I will not enter real patient information. I agree to the information I enter being processed to find matching
              trials.
            </span>
          </label>
        </div>
        <div className="gate-actions">
          <button type="button" className="btn go" onClick={onSample}>
            Use the sample patient (Margaret)
          </button>
          <button type="button" className="ghost gate-continue" disabled={!agreed} onClick={onContinue}>
            Continue with a synthetic note
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================ workspace shell ============================= */

function Sidebar({
  phase,
  profile,
  theme,
  onTheme,
  onHome,
  onNewSearch,
  showControls,
  prefs,
  onTogglePref,
  studyFilter,
  onStudyFilter,
  query,
  onQuery,
  phaseFilter,
  onTogglePhase,
  topK,
  onTopK,
  saved,
  onToggleSave,
  onOpenSaved,
  matches,
}: {
  phase: Phase;
  profile: Profile | null;
  theme: "light" | "dark";
  onTheme: () => void;
  onHome: () => void;
  onNewSearch: () => void;
  showControls: boolean;
  prefs: Set<PrefKey>;
  onTogglePref: (k: PrefKey) => void;
  studyFilter: StudyFilter;
  onStudyFilter: (f: StudyFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  phaseFilter: Set<string>;
  onTogglePhase: (p: string) => void;
  topK: TopK;
  onTopK: (k: TopK) => void;
  saved: Set<string>;
  onToggleSave: (n: string) => void;
  onOpenSaved: (n: string) => void;
  matches: TrialMatch[];
}) {
  const active = stepKey(phase);
  const doneUpTo = STEPS.findIndex((s) => s.key === active);
  const savedList = matches.filter((m) => saved.has(m.nctId));
  const studyOpts: [StudyFilter, string][] = [
    ["all", "All"],
    ["treatment", "Treatment"],
    ["observational", "Observational"],
  ];
  const topOpts: [TopK, string][] = [
    [10, "10"],
    [25, "25"],
    ["all", "All"],
  ];
  // CT.gov-familiar phase facet, in registry order, limited to phases present.
  const phaseOrder = ["Early Phase 1", "Phase 1", "Phase 1/2", "Phase 2", "Phase 2/3", "Phase 3", "Phase 4", "N/A"];
  const presentPhases = Array.from(new Set(matches.map((m) => m.phase))).sort(
    (a, b) => phaseOrder.indexOf(a) - phaseOrder.indexOf(b),
  );

  return (
    <aside className="sidebar">
      <button type="button" className="sb-brand" onClick={onHome}>
        <TrialLogo />
        Trialign <small>patient</small>
      </button>

      <div className="demo-badge sb-demo">DEMO · SYNTHETIC DATA ONLY</div>

      <button type="button" className="sb-new" onClick={onNewSearch}>
        + New search
      </button>

      <nav className="sb-steps" aria-label="Progress">
        {STEPS.map((s, i) => (
          <div key={s.key} className={`sb-step ${s.key === active ? "on" : i < doneUpTo ? "done" : ""}`}>
            <span className="sb-step-dot" />
            {s.label}
          </div>
        ))}
      </nav>

      {profile && (
        <div className="sb-profile">
          <div className="sb-h">Your profile</div>
          <p className="sb-summary">{profile.summary}</p>
        </div>
      )}

      {showControls && (
        <div className="sb-controls">
          <div className="sb-sec">
            <div className="sb-h">Search</div>
            <input
              className="sb-search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="NCT id or title…"
              aria-label="Search results by NCT id or title"
              autoComplete="off"
            />
          </div>

          <div className="sb-sec">
            <div className="sb-h">Study type</div>
            <div className="seg">
              {studyOpts.map(([val, label]) => (
                <button key={val} className={`seg-btn ${studyFilter === val ? "on" : ""}`} onClick={() => onStudyFilter(val)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {presentPhases.length > 1 && (
            <div className="sb-sec">
              <div className="sb-h">Phase</div>
              <div className="sb-prefs">
                {presentPhases.map((p) => (
                  <button key={p} className={`pref ${phaseFilter.has(p) ? "on" : ""}`} onClick={() => onTogglePhase(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="sb-sec">
            <div className="sb-h">Priorities</div>
            <div className="sb-prefs">
              {PREFS.map((p) => (
                <button key={p.key} className={`pref ${prefs.has(p.key) ? "on" : ""}`} title={p.hint} onClick={() => onTogglePref(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sb-sec">
            <div className="sb-h">Show ranked</div>
            <div className="seg">
              {topOpts.map(([val, label]) => (
                <button key={String(val)} className={`seg-btn ${topK === val ? "on" : ""}`} onClick={() => onTopK(val)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="sb-sec">
            <div className="sb-h">To discuss{savedList.length > 0 ? ` (${savedList.length})` : ""}</div>
            {savedList.length === 0 ? (
              <p className="sb-empty">Star a trial to add it here.</p>
            ) : (
              <div className="sb-saved">
                {savedList.map((m) => (
                  <span key={m.nctId} className="sb-saved-chip">
                    <button className="sb-saved-open mono" onClick={() => onOpenSaved(m.nctId)} title={m.title}>
                      {m.nctId}
                    </button>
                    <button className="sb-saved-x" onClick={() => onToggleSave(m.nctId)} aria-label={`remove ${m.nctId}`}>
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <button
        className="sb-theme"
        onClick={onTheme}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? "☀ Light" : "☾ Dark"}
      </button>
    </aside>
  );
}

/* ============================ phase views ================================= */

/* Per-tab product cards (website-content-prd §4.4 / §5.4 / §6.5). Same card
   component + carousel — only the copy differs by portal mode. The closing-window
   card is intentionally first on every tab (§7.3). */
type ProductSlide = { title: string; paras: string[] };
const PRODUCT_CARDS: Record<PortalMode, ProductSlide[]> = {
  patient: [
    {
      title: "See what closes",
      paras: [
        "Trial options aren't static. Starting your next line of therapy can permanently exclude you from trials no one flagged.",
        "Trialign shows which trials stay open and which close — before you decide, not after.",
      ],
    },
    {
      title: "Every criterion, with its reasoning",
      paras: [
        "No black-box match score. Each inclusion and exclusion criterion is judged against your record — met, not met, needs confirmation, or unknown.",
        "Uncertain calls are flagged, never guessed.",
      ],
    },
    {
      title: "Know what to bring before you call",
      paras: [
        "Expired scans and missing tissue blocks are among the top reasons patients fail screening.",
        "Trialign tells you what to go get — and hands you a one-pager for your oncologist.",
      ],
    },
  ],
  clinician: [
    {
      title: "See what a treatment decision closes",
      paras: [
        "Starting the next line can permanently exclude a patient from trials nobody flagged — and outside the trials you personally run, there is no mechanism to catch it.",
        "Trialign shows which studies close, and when, at the moment you're deciding.",
      ],
    },
    {
      title: "Auditable, not oracular",
      paras: [
        "Every call cites the criterion text it came from. Near-misses list every failing criterion rather than dropping the patient silently.",
        "Uncertain calls are surfaced as uncertain. We never guess a criterion we can't support.",
      ],
    },
    {
      title: "Pre-screens that don't start from zero",
      paras: [
        "Patients arrive with a structured mCODE profile, per-criterion status, and their readiness gaps already surfaced — expired imaging, missing archival tissue, stale labs.",
        "Coordinator time goes to real candidates.",
      ],
    },
  ],
  partner: [
    {
      title: "We intercept your biggest leak",
      paras: [
        "The patients you lose to off-protocol therapy are lost before they ever contact you.",
        "Trialign shows them what their next treatment closes — while the decision is still open.",
      ],
    },
    {
      title: "Pre-screened, not pre-qualified",
      paras: [
        "Every criterion in your protocol, judged against a structured mCODE profile. Uncertain calls flagged rather than guessed.",
        "Coordinators start at 80%, not zero.",
      ],
    },
    {
      title: "Readiness handled up front",
      paras: [
        "Missing archival tissue and expired imaging drive a large share of screen failures.",
        "We surface them to the patient before they call — ordered by lead time.",
      ],
    },
  ],
};

/* §3 closing-window mock — verbatim NCT ids/reasons, rendered in the site's mono
   style with the verdict palette (✓ eligible / ✗ near). */
const CLOSING_OPEN = ["NCT06412831", "NCT06390247", "NCT06255190", "NCT06188402"];
const CLOSING_CLOSED: [string, string][] = [
  ["NCT06301175", "no prior AKT inhibitor"],
  ["NCT06274558", "no prior PI3K/AKT/mTOR"],
  ["NCT06149023", "≤2 prior lines of therapy"],
];

/* §3 — "What your next treatment closes" (Patient tab only), between hero and
   product cards. Two columns; copy left, mono mock right, stacks on mobile. */
function ClosingWindow() {
  const bgRef = useRef<HTMLElement>(null);
  return (
    <section ref={bgRef} className="closing" aria-label="What your next treatment closes">
      <AsciiBackground trackRef={bgRef} variant="subtle" className="ascii-bg ascii-bg--panel" />
      <div className="closing__inner">
        <div className="closing__copy">
          <p className="home-kicker">What your next treatment closes</p>
          <h2 className="closing__h">Eligibility is not a snapshot. It&apos;s a window that closes.</h2>
          <p className="closing__body">
            Many trials permanently exclude patients who&apos;ve already started certain therapies. After showing your matches, Trialign asks
            what your care team has recommended next — and shows exactly which trials stay open and which close if you start it.
          </p>
          <p className="closing__body closing__body--strong">Before you decide, not after.</p>
        </div>
        <div className="closing__mock mono">
          <div className="closing__mock-head">IF YOU START CAPIVASERTIB NEXT MONTH:</div>
          <div className="closing__cols">
            <div className="closing__col closing__col--open">
              <div className="closing__col-h">STAYS OPEN ({CLOSING_OPEN.length})</div>
              <div className="closing__rule" aria-hidden />
              {CLOSING_OPEN.map((id) => (
                <div key={id} className="closing__row">
                  <span className="closing__nct">{id}</span>
                  <span className="closing__ok" aria-label="stays open">✓</span>
                </div>
              ))}
            </div>
            <div className="closing__col closing__col--closed">
              <div className="closing__col-h">CLOSES ({CLOSING_CLOSED.length})</div>
              <div className="closing__rule" aria-hidden />
              {CLOSING_CLOSED.map(([id, reason]) => (
                <div key={id} className="closing__row">
                  <span className="closing__nct">{id}</span>
                  <span className="closing__no" aria-label="closes">✗</span>
                  <span className="closing__reason">{reason}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Home({
  mode,
  onEnter,
  onSelectPatient,
}: {
  mode: PortalMode;
  onEnter: () => void;
  onSelectPatient: () => void;
}) {
  const productRef = useRef<HTMLElement>(null);
  const copy = {
    patient: {
      kicker: "Patient portal",
      title: "See which trials you qualify for — and which ones close if you start treatment.",
      lede: "Describe your situation, upload a note, or connect your medical records (SMART on FHIR). Trialign structures it, screens live against recruiting studies on ClinicalTrials.gov, and shows the inclusion and exclusion reasoning for every match — including which trials your next treatment would take off the table.",
      cta: "Enter patient portal →",
    },
    clinician: {
      kicker: "Clinician & CRC portal",
      title: "Eligibility calls you can audit. Not a black-box score.",
      lede: "Built for clinicians and clinical research coordinators. Every criterion in the protocol, judged against a structured patient record, with the source text behind each call and the gaps flagged for follow-up.",
      cta: "Clinician & CRC portal — coming soon",
    },
    partner: {
      kicker: "Partners",
      title: "Patients who've already pre-screened themselves for your study.",
      lede: "Patients find your trial, see exactly which criteria they meet and which gaps they need to close, and choose to refer themselves. You receive a structured pre-screen packet — not a cold call.",
      cta: "Partner portal — coming soon",
    },
  }[mode];

  return (
    <>
      <div className="scroll home-scroll">
        <HeroVideo />
        <div key={mode} className="col home-col home-mode-fade">
          <section className="home-hero">
            <p className="home-kicker">{copy.kicker}</p>
            <h1>{copy.title}</h1>
            {mode === "patient" && (
              <p className="home-problem">
                The drug you start next could be the reason you can&apos;t get into a trial. Many trials exclude patients who&apos;ve already
                tried certain therapies. Make sure you know before you decide.
              </p>
            )}
            {mode !== "patient" && <p className="home-lede">{copy.lede}</p>}
            {mode === "partner" && (
              <p className="home-lede home-lede--follow">
                <b>We don&apos;t sell patient lists.</b> A patient signs an authorization naming your specific study and site. Not a lead. A
                patient who chose you.
              </p>
            )}
          </section>
          <div className="home-actions">
            {mode === "patient" ? (
              <button type="button" className="btn go home-cta" onClick={onEnter}>
                {copy.cta}
              </button>
            ) : (
              <p className="home-soon">
                <b>{copy.cta}</b> —{" "}
                {mode === "clinician" ? "we're working to onboard clinical teams" : "we're onboarding research partners now"}. Switch to{" "}
                <button type="button" className="home-link" onClick={onSelectPatient}>
                  Patient
                </button>{" "}
                to try the live demo.
              </p>
            )}
          </div>
        </div>
      </div>
      <div key={mode} className="home-mode-fade">
      {mode === "patient" && <ClosingWindow />}
      <section ref={productRef} className="home-product" aria-label="Product information">
        <AsciiBackground trackRef={productRef} variant="subtle" className="ascii-bg ascii-bg--panel" />
        <div className="home-product__inner">
          <header className="home-product__head">
            <p className="home-product__kicker">Product</p>
            <h2>Built for transparent trial matching</h2>
          </header>
          <ProductCarousel slides={PRODUCT_CARDS[mode]} />
          {mode === "partner" && (
            <p className="home-stat">
              Roughly 76% of patients considered for trials never reach first dose. The single largest cause isn&apos;t ineligibility — it&apos;s
              patients starting another therapy before anyone showed them what it would close.
            </p>
          )}
        </div>
      </section>
      </div>
    </>
  );
}

function AppFooter({ theme, onTheme }: { theme: "light" | "dark"; onTheme: () => void }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <strong>Trialign</strong>
            <span>Clinical trial matching with transparent eligibility reasoning.</span>
          </div>
        </div>
        <div className="site-footer__cols">
          <section>
            <h3>Privacy</h3>
            <p>
              Trialign isn&apos;t a HIPAA-covered entity, and doesn&apos;t need to be. You enter your own information, or authorize your own
              records under the 21st Century Cures Act. The disclosure is yours to make, not a hospital&apos;s.
            </p>
            <p>
              <b>We don&apos;t keep your records.</b> Your information is processed to find matches and is never written to a database or storage
              on our systems.
            </p>
          </section>
          <section>
            <h3>Who sees your data</h3>
            <p>
              <b>We use Claude (Anthropic) to read and structure your record.</b> Your information is sent to Anthropic&apos;s API to generate
              your matches. Anthropic does not use it for model training, and deletes it from their systems within 30 days.
            </p>
            <p>
              <b>This is the only third party your health information reaches.</b> We run no analytics, advertising, or tracking on any page that
              touches health information.
            </p>
          </section>
          <section>
            <h3>What Trialign is not</h3>
            <p>
              Trialign is <b>not medical advice</b> and <b>not an eligibility determination.</b> Only a study team can confirm whether you
              qualify, after a screening workup.
            </p>
            <p>
              <b>Nothing here is a reason to delay or change treatment.</b> Bring it to your oncologist.
            </p>
            <p>
              Questions: <a href="mailto:privacy@trialign.com">privacy@trialign.com</a>
            </p>
          </section>
        </div>
        <div className="site-footer__bottom">
          <p className="site-footer__legal">
            © 2026 Trialign · Built on FHIR R4 and mCODE — the data standard ONC and the NCI published for cancer trial matching.
            <br />
            Informational decision support. Not medical advice, not a final eligibility determination, not a substitute for professional clinical
            judgment.
          </p>
          <div className="site-footer__prefs">
            <button
              type="button"
              className="footer-theme"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={onTheme}
            >
              {theme === "dark" ? "☀ Light" : "☾ Dark"}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}

function pickWelcomeGreeting(): string {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  let returning = false;
  try {
    returning = !!localStorage.getItem("trial:visited");
    localStorage.setItem("trial:visited", "1");
  } catch {
    // storage unavailable (private mode, etc.)
  }

  const pool = [
    "Welcome",
    timeGreeting,
    "Good to see you",
    "Ready when you are",
    ...(returning ? (["Hey, you're back", "Welcome back"] as const) : []),
  ];

  return pool[Math.floor(Math.random() * pool.length)];
}

function Landing({
  note,
  setNote,
  onRead,
  onSample,
  onPdf,
  onConnect,
  studyTypes,
  onToggleStudyType,
  survey,
  onSurvey,
  entrant,
  onEntrant,
}: {
  note: string;
  setNote: (s: string) => void;
  onRead: (s: string) => void;
  onSample: () => void;
  onPdf: (f: File) => void;
  onConnect: () => void;
  studyTypes: Set<StudyTypeKey>;
  onToggleStudyType: (k: StudyTypeKey) => void;
  survey: SurveyPrefs;
  onSurvey: (s: SurveyPrefs) => void;
  entrant: Entrant;
  onEntrant: (e: Entrant) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [greeting, setGreeting] = useState("Welcome");
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setGreeting(pickWelcomeGreeting());
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div ref={scrollRef} className="scroll scroll--landing">
      <div className="col landing-col">
        <div className="hero">
          <h1 className={entered ? "in" : undefined} suppressHydrationWarning>
            {greeting}
          </h1>
          <p className="hero-lede">
            Describe a situation or try the sample patient. I&apos;ll screen you live against recruiting ClinicalTrials.gov studies and show the
            reasoning behind every match. It takes about two minutes:
          </p>
          <ol className="hero-steps" aria-label="How it works">
            <li>
              <span className="isn">1</span> I read your note into a structured profile
            </li>
            <li>
              <span className="isn">2</span> A few questions — only the gaps that change your matches
            </li>
            <li>
              <span className="isn">3</span> You review and edit before I search
            </li>
          </ol>
          {/* One panel: scope is answered first, then the note composer sits below the divider. */}
          <div className="intake-card">
            <ScopeFields
              studyTypes={studyTypes}
              onToggleStudyType={onToggleStudyType}
              survey={survey}
              onSurvey={onSurvey}
              entrant={entrant}
              onEntrant={onEntrant}
            />
            <div className="intake-card__sep" aria-hidden />
            <div className="paste">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    onRead(note);
                  }
                }}
                placeholder="Paste a synthetic note or describe a test scenario…"
              />
              {/* Composer action bar: bring-your-records options dock bottom-left
                  (Claude-desktop style), the send button anchors bottom-right. The
                  per-option descriptions live in the title tooltips. */}
              <div className="row">
                <div className="paste-actions">
                  {/* Upload PDF is hidden until the feature is ready — restore the
                      button below to re-enable it (the file input + onPdf wiring stays). */}
                  {false && (
                    <button
                      type="button"
                      className="composer-btn"
                      onClick={() => fileRef.current?.click()}
                      title="Upload a PDF — try a synthetic visit summary or pathology report. I'll read the text."
                    >
                      <span className="composer-btn__ic" aria-hidden>
                        ⬆
                      </span>
                      Upload PDF
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onPdf(f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="composer-btn"
                    onClick={onConnect}
                    title="Connect my medical records — pull your chart from your provider (SMART on FHIR). Demo uses a public sandbox."
                  >
                    <span className="composer-btn__ic" aria-hidden>
                      ⚕
                    </span>
                    Connect records
                    <span className="composer-btn__badge">FHIR</span>
                  </button>
                </div>
                <span className="sp" />
                <button className="btn go" onClick={() => onRead(note)}>
                  Get started →
                </button>
              </div>
            </div>
          </div>

          <div className="chips">
            <button className="chip" onClick={onSample}>
              <span className="s">demo</span> Try a sample patient (Margaret)
            </button>
          </div>

          {/* Audit #8/#6: the label belongs on every screen that touches health
              data, and this is the screen where it is actually entered. */}
          <div className="demo-badge" style={{ marginTop: 16 }}>
            DEMO · SYNTHETIC DATA ONLY
          </div>
          <div className="disclaimer" style={{ marginTop: 20 }}>
            Informational decision support to review with your care team — not medical advice or a final eligibility determination. Trial data is
            live from ClinicalTrials.gov. Please use synthetic personas only in this demo, not real patient data.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Scope fields (§4): who's asking · study-type scope · travel band. Answered
   up front, inline at the top of the intake card — before the note composer — so
   the search is scoped before the patient shares anything. Study type is applied
   server-side before reasoning; travel ranks (never hard-filters). */
function ScopeFields({
  studyTypes,
  onToggleStudyType,
  survey,
  onSurvey,
  entrant,
  onEntrant,
}: {
  studyTypes: Set<StudyTypeKey>;
  onToggleStudyType: (k: StudyTypeKey) => void;
  survey: SurveyPrefs;
  onSurvey: (s: SurveyPrefs) => void;
  entrant: Entrant;
  onEntrant: (e: Entrant) => void;
}) {
  const needsLoc = travelNeedsLocation(survey.travel);
  const setTravel = (t: TravelPref) => onSurvey({ ...survey, travel: survey.travel === t ? null : t });

  return (
    <div className="intake-scope">
      <div className="chiprow__group">
        <div className="chiprow__q">Who&apos;s filling this out?</div>
        <div className="chiprow__bands">
          {ENTRANTS.map((e) => (
            <button key={e.value} type="button" className={`band ${entrant === e.value ? "on" : ""}`} onClick={() => onEntrant(e.value)}>
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chiprow__group">
        <div className="chiprow__q">What kinds of studies should I look for?</div>
        <div className="chiprow__chips">
          {STUDY_TYPE_CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`scope-chip ${studyTypes.has(c.key) ? "on" : ""}`}
              aria-pressed={studyTypes.has(c.key)}
              onClick={() => onToggleStudyType(c.key)}
            >
              <span className="scope-chip__box" aria-hidden>
                {studyTypes.has(c.key) ? "✓" : ""}
              </span>
              <span className="scope-chip__text">
                <span className="scope-chip__label">{c.label}</span>
                <span className="scope-chip__hint">{c.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="chiprow__group">
        <div className="chiprow__q">Where are you, and how far could you go?</div>
        <div className="chiprow__bands">
          {TRAVEL_BANDS.map((b) => (
            <button key={b.value} type="button" className={`band ${survey.travel === b.value ? "on" : ""}`} onClick={() => setTravel(b.value)}>
              {b.label}
            </button>
          ))}
        </div>
        {needsLoc && (
          <div className="chiprow__loc">
            <input
              className="chiprow__zip"
              value={survey.location}
              onChange={(e) => onSurvey({ ...survey, location: e.target.value })}
              placeholder="ZIP code (e.g. 02114)"
              inputMode="numeric"
              autoComplete="postal-code"
              aria-label="ZIP code"
            />
            <span className="chiprow__lochint">
              ZIP only — used to <b>rank</b> by distance. Trials farther away are still shown under “Farther from you,” never dropped.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Connect my medical records: patient-mediated SMART on FHIR import ---- */
function Connect({
  onPick,
  onBack,
}: {
  onPick: (src: "live" | "bundled", id: string, label: string) => void;
  onBack: () => void;
}) {
  const [list, setList] = useState<ConnectList | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/connect-records")
      .then((r) => r.json())
      .then((d) => {
        if (live) setList(d as ConnectList);
      })
      .catch((e) => live && setLoadErr(errMsg(e)));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="scroll scroll--landing">
      <div className="col landing-col">
        <div className="hero">
          <p className="home-kicker">Connect my medical records</p>
          <h1 className="in">Pull your chart, not just your memory.</h1>
          <p>
            Under the 21st Century Cures Act, you can authorize an app to pull your own records from your provider through a standardized FHIR
            API — the same mechanism Apple Health uses. I read the documents it returns into your profile.
          </p>
          <div className="demo-badge" style={{ display: "inline-block", marginTop: 4 }}>
            DEMO · SMART HEALTH IT PUBLIC SANDBOX · SYNTHETIC DATA ONLY
          </div>

          {loadErr && (
            <div className="err" style={{ marginTop: 16 }}>
              <b>Couldn&apos;t reach the sandbox.</b> {loadErr}
            </div>
          )}

          {!list && !loadErr && (
            <div className="working" style={{ marginTop: 18 }}>
              <StoneLoader />
              finding available patients…
            </div>
          )}

          {list && (
            <div className="connect">
              {list.bundled.length > 0 && (
                <div className="connect-group">
                  <div className="connect-group__h">Oncology test patient · mCODE R4 bundle</div>
                  {list.bundled.map((p) => (
                    <button key={p.id} className="connect-row" onClick={() => onPick("bundled", p.id, p.label)}>
                      <span className="connect-row__name">{p.label}</span>
                      <span className="connect-row__sum">{p.summary}</span>
                      <span className="connect-row__go">Connect →</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="connect-group">
                <div className="connect-group__h">
                  Live sandbox patients · <span className="mono">{prettyBase(list.base)}</span>
                </div>
                {list.liveError && <p className="sb-empty">Live sandbox unavailable: {list.liveError}</p>}
                {list.live.map((p) => (
                  <button key={p.id} className="connect-row" onClick={() => onPick("live", p.id, p.label)}>
                    <span className="connect-row__name">{p.label}</span>
                    <span className="connect-row__sum">{p.summary}</span>
                    <span className="connect-row__go">Connect →</span>
                  </button>
                ))}
                <p className="connect-note">
                  Real FHIR pull. These synthetic patients are general-population — expect the oncology specifics (biomarkers, staging) to come
                  back as gaps, which is exactly why the notes matter.
                </p>
              </div>
            </div>
          )}

          <div className="continue-row">
            <button className="ghost" onClick={onBack}>
              ← Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function prettyBase(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Capture({
  note,
  origin,
  sourceLabel,
  profile,
  busy,
  error,
  onRetry,
  onContinue,
}: {
  note: string;
  origin: ImportOrigin;
  sourceLabel: string;
  profile: Profile | null;
  busy: boolean;
  error: string | null;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const gaps = profile?.fields.filter((f) => f.gap).length ?? 0;
  // For a FHIR import the "note" is a long composed document — show a friendly
  // source line instead of dumping it. For paste/PDF, show the text we read.
  const sourceText = origin === "fhir" ? `Imported from your chart via SMART on FHIR${sourceLabel ? ` · ${sourceLabel}` : ""}` : sourceLabel ? `${sourceLabel} — ${note}` : note;
  return (
    <div className="scroll">
      <div className="board">
        <div className="umsg">
          <div className="bub">Find clinical trials I may be eligible for.</div>
        </div>
        <div className="agent-say">
          <AgentAvatar />
          <div className="body">
            <div className="who">Your guide · {origin === "fhir" ? "reading your imported record" : "reading your note"}</div>
            <div className={`note-src${origin === "fhir" ? " note-src--fhir" : ""}`}>{sourceText}</div>
            {error ? (
              <div className="err">
                <b>I couldn&apos;t read that.</b> {error}
                <div className="retry">
                  <button className="btn" onClick={onRetry}>
                    Try again
                  </button>
                </div>
              </div>
            ) : busy || !profile ? (
              <div className="thinking" role="status" aria-live="polite">
                <span className="shimmer-text">
                  {origin === "fhir" ? "Building your profile from your record…" : "Building your profile from your note…"}
                </span>
              </div>
            ) : (
              <>
                <div className="readout">
                  <div className="rh">
                    <span className="pulse" /> Your profile · {profile.conditionQuery}
                  </div>
                  {profile.fields.map((f, i) => (
                    <div className="frow" key={i}>
                      <span className="k">{f.label}</span>
                      <span className="v">
                        <SourceBadge source={f.source ?? "note"} />
                        {f.gap ? (
                          <span className="gap">{f.value}</span>
                        ) : f.clinical ? (
                          <span className="mono">{f.value}</span>
                        ) : (
                          f.value
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <ProvenanceLegend />
                <div className="continue-row">
                  <button className="btn go" onClick={onContinue}>
                    Continue →
                  </button>
                  <span className="n">{gaps > 0 ? `${gaps} thing${gaps > 1 ? "s" : ""} we may ask you to confirm` : "no blocking gaps"}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* The preference survey phase was removed in §4: scope (who's asking · study type ·
   travel) now lives inline at the top of the intake card (ScopeFields), answered
   before the note composer. Randomization was dropped per §7. */

function Clarify({
  profile,
  step,
  onAnswer,
  onBack,
  onSkip,
}: {
  profile: Profile;
  step: number;
  onAnswer: (v: string) => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const list = profile.clarifications;
  const c = step < list.length ? list[step] : null;
  return (
    <div className="scroll">
      <div className="board">
        <div className="agent-say">
          <AgentAvatar />
          <div className="body">
            <div className="who">Your guide</div>
            <div>A few quick questions to sharpen your matches — only the gaps that actually change which trials qualify:</div>
          </div>
        </div>
        {c && <ClarifyCard c={c} step={step} total={list.length} onAnswer={onAnswer} onBack={onBack} onSkip={onSkip} />}
      </div>
    </div>
  );
}

function ClarifyCard({
  c,
  step,
  total,
  onAnswer,
  onBack,
  onSkip,
}: {
  c: Clarification;
  step: number;
  total: number;
  onAnswer: (v: string) => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [own, setOwn] = useState("");
  return (
    <div className="clarify">
      <div className="steps">
        <div className="dots">
          {Array.from({ length: total }, (_, i) => (
            <i key={i} className={i <= step ? "on" : ""} />
          ))}
        </div>
        <div className="stepno">
          {step + 1} of {total}
        </div>
      </div>
      <div className="cq">{c.question}</div>
      <div className="cw">{c.rationale}</div>
      {c.gloss && (
        <details className="cgloss">
          <summary>what does this mean?</summary>
          <div className="cgloss__body">{c.gloss}</div>
        </details>
      )}
      {c.options.map((o, i) => (
        <div key={i}>
          <div className="opt" onClick={() => onAnswer(o)}>
            <div className="num">{i + 1}</div>
            <div>
              <div className="ot">{o}</div>
            </div>
          </div>
          <div className="divl" />
        </div>
      ))}
      {/* Free-text answer replaces the old "let my guide decide" option — it sits
          as the last choice in the list, above the Back/Skip footer. */}
      <div className="own">
        <span className="own__ic" aria-hidden>
          ✎
        </span>
        <input
          value={own}
          onChange={(e) => setOwn(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && own.trim()) {
              e.preventDefault();
              onAnswer(own.trim());
            }
          }}
          placeholder="Or type your own answer…"
        />
      </div>
      <div className="cfoot">
        {step > 0 && (
          <button className="ghost" onClick={onBack}>
            ← Back
          </button>
        )}
        <button className="ghost" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}

/* Quick-check field grouping — chunk the flat mCODE field list into a few
   human sections so the record is scannable. Matched by mCODE key first, then
   label keywords; anything unmatched falls to a trailing "Additional" group so
   no field is ever dropped. Original indices are preserved for inline editing. */
type ReviewGroup = { label: string; items: { f: ProfileField; i: number }[] };
const REVIEW_SECTIONS: { label: string; match: (f: ProfileField) => boolean }[] = [
  {
    label: "Demographics",
    match: (f) => /us-core-patient|patient-/.test(f.mcode) || /\b(age|sex|gender|location|zip|residence|dob|birth)\b/i.test(f.label),
  },
  {
    label: "Disease & biomarkers",
    match: (f) =>
      /cancer-condition|cancer-stage|secondary-cancer|tumor-marker|genomic|histolog/.test(f.mcode) ||
      /(diagnos|stage|metasta|receptor|genomic|biomarker|histolog|her2|grade)/i.test(f.label),
  },
  {
    label: "Treatment history",
    match: (f) =>
      /medication-administration|cancer-related-medication|procedure|radiotherapy|surgical/.test(f.mcode) ||
      /(therap|treatment|medication|regimen|\bline\b|surgery|radiation|chemo)/i.test(f.label),
  },
  {
    label: "Current status",
    match: (f) => /ecog|karnofsky|performance|tumor/.test(f.mcode) || /(ecog|performance|measurable|recist|scan|imaging|\blab)/i.test(f.label),
  },
];
function reviewGroups(fields: ProfileField[]): ReviewGroup[] {
  const groups: ReviewGroup[] = REVIEW_SECTIONS.map((s) => ({ label: s.label, items: [] }));
  const additional: { f: ProfileField; i: number }[] = [];
  fields.forEach((f, i) => {
    const si = REVIEW_SECTIONS.findIndex((s) => s.match(f));
    if (si === -1) additional.push({ f, i });
    else groups[si].items.push({ f, i });
  });
  if (additional.length) groups.push({ label: "Additional", items: additional });
  return groups.filter((g) => g.items.length > 0);
}

function Review({
  profile,
  answers,
  consent,
  onConsent,
  onFind,
  onEditField,
  scopeLine,
}: {
  profile: Profile;
  answers: Record<string, string>;
  consent: boolean;
  onConsent: (v: boolean) => void;
  onFind: () => void;
  onEditField: (index: number, value: string) => void;
  scopeLine: string;
}) {
  const applied = Object.keys(answers).length;
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const startEdit = (i: number, current: string) => {
    setEditing(i);
    setDraft(current);
  };
  const commitEdit = (i: number) => {
    const v = draft.trim();
    if (v) onEditField(i, v);
    setEditing(null);
  };

  return (
    <div className="scroll">
      <div className="board">
        <div className="agent-say">
          <AgentAvatar />
          <div className="body">
            <div className="who">Your guide · quick check</div>
            <div>
              Here&apos;s what I&apos;ll match on. Correct anything before we search — this is the record every eligibility call is checked
              against. I&apos;ll search live for <span className="mono">{profile.conditionQuery}</span>.
            </div>
            {/* §8 — echo the scope the search will run with. */}
            <div className="scope-echo">
              ◎ {scopeLine}
            </div>
          </div>
        </div>

        {reviewGroups(profile.fields).map((g) => (
          <div className="pgroup" key={g.label}>
            <div className="pgroup-h">{g.label}</div>
            <div className="profile">
              {g.items.map(({ f, i }) => (
                <div className={`prow${editing === i ? " editing" : ""}`} key={i}>
                  {/* Schema key demoted to a tooltip — the label alone is what the patient needs. */}
                  <span className="k" title={f.mcode || undefined}>
                    {f.label}
                  </span>
                  <span className="v">
                    <SourceBadge source={f.source ?? "note"} />
                    {editing === i ? (
                      <input
                        className="prow-input"
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => commitEdit(i)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitEdit(i);
                          } else if (e.key === "Escape") {
                            setEditing(null);
                          }
                        }}
                      />
                    ) : f.clinical ? (
                      <span className="mono">{f.value}</span>
                    ) : (
                      f.value
                    )}
                  </span>
                  {editing === i ? (
                    <button className="edit" onClick={() => commitEdit(i)}>
                      done
                    </button>
                  ) : (
                    <button className="edit" onClick={() => startEdit(i, f.value)}>
                      edit
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        <ProvenanceLegend schema />

        <label className="consent">
          <input type="checkbox" checked={consent} onChange={(e) => onConsent(e.target.checked)} />
          <span>
            I understand this is informational decision support to review with a care team — <b>not medical advice</b> — and not a final
            eligibility determination.
          </span>
        </label>

        <div className="continue-row">
          <button className="btn go" disabled={!consent} onClick={onFind}>
            Find my trials →
          </button>
          <span className="n">
            {applied > 0 ? `${applied} answer${applied > 1 ? "s" : ""} applied · ` : ""}
            reasoning over the top 10 recruiting matches
          </span>
        </div>
      </div>
    </div>
  );
}

/** The brand's signature loader (trial-craft-motion §4): the logo's five
 *  stepping-stone dots fading up 60ms apart. Replaces the generic working-dots. */
function StoneLoader() {
  return (
    <span className="stones" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function Reason({ busy, error, onRetry }: { busy: boolean; error: string | null; onRetry: () => void }) {
  const lines = [
    "Searching recruiting studies on ClinicalTrials.gov…",
    "Applying the basics (your condition · recruiting · phase)…",
    "Breaking each study's eligibility into plain criteria…",
    "Checking every criterion against your profile…",
    "Flagging what needs confirming · never guessing a maybe into a yes…",
  ];
  return (
    <div className="scroll">
      <div className="board">
        <div className="agent-say">
          <AgentAvatar />
          <div className="body">
            <div className="who">Your guide · searching</div>
            {error ? (
              <div className="err">
                <b>The search failed.</b> {error}
                <div className="retry">
                  <button className="btn" onClick={onRetry}>
                    Try again
                  </button>
                </div>
              </div>
            ) : (
              <div className="reason">
                {lines.map((l, i) => (
                  <div className="l" key={i} style={{ animationDelay: `${i * 0.35}s` }}>
                    <span className="t">·</span>
                    <span>{l}</span>
                  </div>
                ))}
                {busy && (
                  <div className="working" style={{ marginTop: 10 }}>
                    <StoneLoader />
                    reading each trial closely — one check per trial…
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- preference controls: the patient-agency lever (transparent re-ranking) ---- */
type PrefKey = "near" | "established" | "open" | "burden";
const PREFS: { key: PrefKey; label: string; hint: string }[] = [
  { key: "near", label: "Stay near home", hint: "prioritize a site close to you" },
  { key: "established", label: "Established science", hint: "weight later-phase trials" },
  { key: "open", label: "Avoid randomization / placebo", hint: "down-rank blinded or randomized designs" },
  { key: "burden", label: "Lower burden", hint: "favor fewer visits and procedures (rough estimate)" },
];

function prefScore(m: TrialMatch, prefs: Set<PrefKey>): number {
  let s = 0;
  if (prefs.has("near")) s += m.factors.proximityScore * 2; // 0..8 (see lib/geo bands)
  if (prefs.has("established")) s += m.factors.phaseRank; // 0..4
  if (prefs.has("open")) s += m.factors.randomized ? 0 : 3;
  if (prefs.has("burden")) s += 2 - m.factors.burdenProxy; // 0..2
  return s;
}

function prefReasons(m: TrialMatch, prefs: Set<PrefKey>): string[] {
  const r: string[] = [];
  if (prefs.has("near")) {
    if (m.factors.proximityScore >= 4) r.push(`site in ${m.factors.nearestSite}`);
    else if (m.factors.proximityScore === 3) r.push("a site in your state");
    else if (m.factors.proximityScore === 2) r.push("a site in a neighboring state");
  }
  if (prefs.has("established") && m.factors.phaseRank >= 3) r.push(`later-phase (${m.phase})`);
  if (prefs.has("open") && !m.factors.randomized) r.push("open-label, no randomization");
  if (prefs.has("burden") && m.factors.burdenProxy === 0) r.push("observational — lower burden");
  return r;
}

function passesStudyFilter(m: TrialMatch, f: StudyFilter): boolean {
  if (f === "all") return true;
  return f === "treatment" ? m.interventional : !m.interventional;
}
function passesPhaseFilter(m: TrialMatch, f: Set<string>): boolean {
  return f.size === 0 || f.has(m.phase);
}
function matchesQuery(m: TrialMatch, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return m.nctId.toLowerCase().includes(t) || m.title.toLowerCase().includes(t);
}
/** Apply the CT.gov-familiar refine facets (search · study type · phase) shared by every section. */
function passesFacets(m: TrialMatch, studyFilter: StudyFilter, phaseFilter: Set<string>, query: string): boolean {
  return passesStudyFilter(m, studyFilter) && passesPhaseFilter(m, phaseFilter) && matchesQuery(m, query);
}
function limitK<T>(list: T[], k: TopK): T[] {
  return k === "all" ? list : list.slice(0, k);
}
/* What each band actually resolves to. Kept truthful to lib/geo's thresholds:
   we place sites at city/state granularity, so "within a few hours" is honestly
   reported as your state or one bordering it — not as a mileage we cannot
   compute, and no longer as the whole country. */
function travelLabel(t: TravelPref | null): string {
  return t === "local" ? "in your state" : t === "regional" ? "in or next to your state" : "anywhere";
}

/** Coarse age of a registry record, for the staleness chip. Deliberately blunt
 *  — the point is "this may not be current", not a precise interval. */
function monthsAgo(days: number): string {
  const months = Math.floor(days / 30);
  if (months >= 24) return `${Math.floor(months / 12)} yrs`;
  return `${months} mo`;
}

/** DecisionFactors.burdenProxy (0..2) → the caregiver-facing label. A proxy from
 *  study type + phase, not a measurement — the label says "estimate" wherever
 *  it's shown so it never launders into a stated fact (P4). */
const BURDEN_LABEL = ["Lower", "Moderate", "Higher"];

/** The summary buckets — canonical counts, always reconcile to the pool total. */
const COUNT_BUCKETS: { key: MatchStatus; cls: string; label: string }[] = [
  { key: "eligible", cls: "eligible", label: "eligible" },
  { key: "uncertain", cls: "uncertain", label: "pending" },
  { key: "near", cls: "near", label: "ruled out" },
  { key: "excluded", cls: "near", label: "not open to you" },
  { key: "screened", cls: "", label: "not yet reasoned" },
];

/** §P1 card summary for the "Not open to you yet" section — names the unmet
 *  requirements directly so a patient reads what's in the way without opening
 *  the card. Short and comma-joined; truncated because "everything" read out
 *  in full is not a list anyone can act on. */
function notYetWhy(criteria: Criterion[]): string {
  const reqs = criteria.filter((c) => c.verdict === "fails" && c.remediable).map((c) => c.requirement);
  const SHOWN = 3;
  if (reqs.length <= SHOWN) return reqs.join(", ");
  return `${reqs.slice(0, SHOWN).join(", ")}, +${reqs.length - SHOWN} more`;
}

/* ============================ THE FORK (§6) ============================== */
/* Post-Results decision screen: pick a hypothetical next treatment, see which
   currently-open trials it would keep open vs. close, each with the driving
   criterion. "Nothing decided yet" opens the whole tree. */

function Fork({
  profile,
  matches,
  location,
  onForkNote,
  onBack,
}: {
  profile: Profile;
  matches: TrialMatch[];
  location: LocationInfo;
  onForkNote: (note: string | null) => void;
  onBack: () => void;
}) {
  // Input universe: the trials the patient is OPEN to today (a next line can only
  // "close" a door that's currently open). Must carry a criterion ledger to reuse.
  const openTrials = matches.filter((m) => (m.status === "eligible" || m.status === "uncertain") && m.criteria.length > 0);
  const trialById = new Map(openTrials.map((m) => [m.nctId, m]));

  const [options, setOptions] = useState<ForkOption[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [results, setResults] = useState<ForkResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/fork-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: { summary: profile.summary, fields: profile.fields.map((f) => ({ label: f.label, value: f.value })) } }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!live) return;
        if (!ok) setLoadErr(d.error || "Couldn't generate options.");
        else setOptions(d.options as ForkOption[]);
      })
      .catch((e) => live && setLoadErr(errMsg(e)));
    return () => {
      live = false;
    };
  }, [profile]);

  async function run(opt: ForkOption) {
    if (opt.kind === "other" && !custom.trim()) return;
    setSelectedId(opt.id);
    setBusy(true);
    setRunErr(null);
    setResults(null);
    // Which treatment(s) to judge: the whole tree, a single line, or a typed one.
    const treatments = (options ?? []).filter((o) => o.kind === "treatment");
    const send =
      opt.kind === "all"
        ? treatments.map((o) => ({ id: o.id, label: o.label, drugClass: o.drugClass }))
        : opt.kind === "other"
          ? [{ id: "something-else", label: custom.trim(), drugClass: "" }]
          : [{ id: opt.id, label: opt.label, drugClass: opt.drugClass }];
    try {
      const res = await fetch("/api/fork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: { summary: profile.summary, fields: profile.fields.map((f) => ({ label: f.label, value: f.value })) },
          options: send,
          trials: openTrials.map((m) => ({
            nctId: m.nctId,
            title: m.title,
            phase: m.phase,
            criteria: m.criteria.map((c) => ({ kind: c.kind, requirement: c.requirement, verdict: c.verdict, evidence: c.evidence })),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fork reasoning failed.");
      const results = data.results as ForkResult[];
      setResults(results);
      // Carry a one-line summary into Packet A when the patient picked a single
      // concrete treatment (not the whole tree).
      if (opt.kind !== "all" && results.length === 1) {
        const closes = results[0].doors.filter((d) => d.door === "closes").length;
        onForkNote(`Starting ${results[0].optionLabel} would close ${closes} of your ${openTrials.length} currently-open trials.`);
      }
    } catch (e) {
      setRunErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scroll">
      <div className="board">
        <div className="agent-say">
          <AgentAvatar />
          <div className="body">
            <div className="who">Your guide · what&apos;s next</div>
            <div>
              You&apos;re looking at <b>{openTrials.length}</b> trial{openTrials.length === 1 ? "" : "s"} you may qualify for today. Some are
              time-sensitive: a next line of treatment can quietly <b>close</b> the door on a trial. Pick what your care team is weighing — or see
              the whole tree — and I&apos;ll show you which doors stay open.
            </div>
          </div>
        </div>

        {/* §6.4 — non-negotiable, shown on every Fork view. */}
        <div className="fork-disclaimer">{FORK_DISCLAIMER}</div>

        {loadErr && <div className="err">{loadErr}</div>}
        {!options && !loadErr && (
          <div className="working" style={{ marginTop: 6 }}>
            <StoneLoader />
            reading your note for the plausible next lines of treatment…
          </div>
        )}

        {options && (
          <div className="fork-opts">
            <div className="fork-opts__h">What might you start next?</div>
            {options.map((o) => {
              const on = selectedId === o.id;
              if (o.kind === "other") {
                return (
                  <div key={o.id} className={`fork-opt other ${on ? "on" : ""}`}>
                    <div className="fork-opt__main">
                      <div className="fork-opt__label">{o.label}</div>
                      <div className="fork-opt__sub">{o.rationale}</div>
                    </div>
                    <div className="fork-opt__other-row">
                      <input
                        className="fork-opt__input"
                        value={custom}
                        onChange={(e) => setCustom(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && custom.trim()) run(o);
                        }}
                        placeholder="e.g. sacituzumab govitecan"
                      />
                      <button className="btn" disabled={!custom.trim()} onClick={() => run(o)}>
                        Check
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <button key={o.id} className={`fork-opt ${o.kind === "all" ? "tree" : ""} ${on ? "on" : ""}`} onClick={() => run(o)}>
                  <div className="fork-opt__main">
                    <div className="fork-opt__label">
                      {o.label}
                      {o.kind === "all" && <span className="fork-opt__tag">default · full tree</span>}
                    </div>
                    <div className="fork-opt__sub">
                      {o.drugClass ? <span className="fork-opt__class">{o.drugClass}</span> : null}
                      {o.rationale}
                    </div>
                  </div>
                  <span className="fork-opt__go">→</span>
                </button>
              );
            })}
          </div>
        )}

        {busy && (
          <div className="working" style={{ marginTop: 16 }}>
            <StoneLoader />
            checking each open trial against that treatment — reusing the eligibility we already reasoned…
          </div>
        )}
        {runErr && <div className="err">{runErr}</div>}

        {results && !busy && (
          <div className="fork-results">
            {results.map((r) => (
              <ForkPayoff key={r.optionId} result={r} trialById={trialById} location={location} />
            ))}
            <div className="fork-disclaimer bottom">{FORK_DISCLAIMER}</div>
          </div>
        )}

        <div className="continue-row">
          <button className="ghost" onClick={onBack}>
            ← Back to matches
          </button>
        </div>
      </div>
    </div>
  );
}

/* One treatment's payoff: the two-column stays-open / closes split + time line. */
function ForkPayoff({
  result,
  trialById,
  location,
}: {
  result: ForkResult;
  trialById: Map<string, TrialMatch>;
  location: LocationInfo;
}) {
  const rows = result.doors.map((d) => ({ d, m: trialById.get(d.nctId) })).filter((x): x is { d: ForkDoor; m: TrialMatch } => !!x.m);
  const open = rows.filter((x) => x.d.door === "stays_open");
  const closes = rows.filter((x) => x.d.door === "closes");
  const confirm = rows.filter((x) => x.d.door === "confirm");
  const timeLine = forkTimeLine(closes, location);

  return (
    <div className="fork-result">
      <div className="fork-result__h">
        If you start <b>{result.optionLabel}</b> next:
      </div>
      <div className="fork-cols">
        <div className="fork-col open">
          <div className="fork-col__h">Stays open ({open.length})</div>
          {open.length === 0 ? <div className="fork-col__empty">None</div> : open.map((x) => <ForkDoorRow key={x.d.nctId} d={x.d} m={x.m} />)}
        </div>
        <div className="fork-col closes">
          <div className="fork-col__h">Closes ({closes.length})</div>
          {closes.length === 0 ? <div className="fork-col__empty">None</div> : closes.map((x) => <ForkDoorRow key={x.d.nctId} d={x.d} m={x.m} />)}
        </div>
      </div>
      {confirm.length > 0 && (
        <div className="fork-confirm">
          <div className="fork-confirm__h">Can&apos;t tell without more info ({confirm.length}) — never guessed either way</div>
          {confirm.map((x) => (
            <ForkDoorRow key={x.d.nctId} d={x.d} m={x.m} />
          ))}
        </div>
      )}
      {timeLine && <div className="fork-time">◷ {timeLine}</div>}
    </div>
  );
}

function ForkDoorRow({ d, m }: { d: ForkDoor; m: TrialMatch }) {
  const glyph = d.door === "stays_open" ? "✓" : d.door === "closes" ? "✕" : "?";
  return (
    <a className={`fork-door ${d.door}`} href={m.url} target="_blank" rel="noopener noreferrer">
      <span className="fork-door__glyph">{glyph}</span>
      <span className="fork-door__body">
        <span className="fork-door__top">
          <span className="mono">{d.nctId}</span> <span className="fork-door__title">{m.title}</span>
        </span>
        {d.criterion && (
          <span className="fork-door__crit">
            <span className={`ck ${d.kind}`}>{d.kind}</span> {d.criterion}
          </span>
        )}
        {d.reason && <span className="fork-door__why">{d.reason}</span>}
      </span>
    </a>
  );
}

/* Time dimension (§6.3) — reuse enrollmentWindow + proximity; no new geo work. */
function forkTimeLine(closes: { d: ForkDoor; m: TrialMatch }[], location: LocationInfo): string {
  const M = closes.length;
  if (M === 0) return "";
  const openNow = closes.filter((x) => x.m.factors.enrollmentWindow.startsWith("Open now"));
  const plural = M > 1 ? "s" : "";
  if (location.applied) {
    const inRange = openNow.filter((x) => x.m.factors.withinRange === true).length;
    return `${inRange} of the ${M} closing trial${plural} ${inRange === 1 ? "is" : "are"} enrolling now with a site within your range — worth raising first.`;
  }
  return `${openNow.length} of the ${M} closing trial${plural} ${openNow.length === 1 ? "is" : "are"} enrolling now.`;
}

/* ============================ CONNECT / REFERRAL (connect-prd) ============================
   Per-trial, post-Fork. We attach at Steps 1–2 of the regulated enrollment sequence
   (initial contact + pre-screen) and hand off at Step 3. Pre-screen accelerator, NOT an
   eligibility determiner: surface the basis for judgment, never render the verdict. */

const CONNECT_DISCLAIMER =
  "We don't determine eligibility and we don't obtain consent — the study team does that, in person, after a screening workup. Never delay or decline standard-of-care therapy to preserve trial eligibility. This helps your conversation with your care team start informed.";
const ELIGIBILITY_FRAMING =
  "This is not an eligibility determination. Only the study team can confirm whether you qualify, after a screening workup. This shows you how your record lines up against the published criteria.";

/* Four §3 display states, derived from verdict + provenance (never a new verdict). */
type CritState = "met" | "not_met" | "confirm" | "unknown";
function critState(c: Criterion): CritState {
  if (c.verdict === "fails") return "not_met";
  if (c.verdict === "meets" || c.verdict === "clear") return "met";
  return c.provenance === "not_documented" ? "unknown" : "confirm"; // confirm verdict
}
const CRIT_STATE_META: Record<CritState, { glyph: string; label: string; cls: string }> = {
  met: { glyph: "✓", label: "Met", cls: "met" },
  not_met: { glyph: "✕", label: "Not met", cls: "notmet" },
  confirm: { glyph: "⚠", label: "Needs confirmation", cls: "confirm" },
  unknown: { glyph: "?", label: "Unknown", cls: "unknown" },
};
/** The ⚠️/❓ rows are the product — the gaps a coordinator would phone to discover. */
function isGap(c: Criterion): boolean {
  const s = critState(c);
  return s === "confirm" || s === "unknown";
}

/* §4 readiness: classify each gap by lead time (longest first — that's what gates
   the timeline) and give a copy-able "ask your oncologist about…" (never an order). */
type Lead = { order: number; band: string; ask: string; why: string };
function classifyGap(c: Criterion): Lead {
  const r = c.requirement.toLowerCase();
  if (/tissue|biopsy|archiv|block|patholog|specimen|tumou?r sample|slides?/.test(r))
    return {
      order: 0,
      band: "2–4 weeks — start this first",
      ask: `Ask my pathology department to confirm a tumor tissue block from my biopsy exists and can be released to an outside institution. (Trial requirement: "${c.requirement}")`,
      why: "Missing biomarker or archived tissue accounts for ~8% of patients who fall out of phase I trials.",
    };
  if (/imag|scan|\bct\b|mri|\bpet\b|recist|measurable|radiograph|restag|lesion/.test(r))
    return {
      order: 1,
      band: "1–2 weeks",
      ask: `Ask my oncologist whether I need fresh imaging (e.g. a restaging CT) — this trial keys off a recent scan. (Trial requirement: "${c.requirement}")`,
      why: "Imaging/measurability issues drive ~29% of post-consent screen failures.",
    };
  if (/lab|cbc|cmp|organ|hemoglob|platelet|creatinin|bilirubin|neutrophil|blood count|marrow|hepatic|renal|function/.test(r))
    return {
      order: 2,
      band: "days",
      ask: `Ask about recent bloodwork (CBC and CMP) within the trial's window. (Trial requirement: "${c.requirement}")`,
      why: "Organ-function/biological issues drive ~24% of post-consent screen failures.",
    };
  return {
    order: 3,
    band: "timing varies",
    ask: `Ask my care team to confirm this with the study team: "${c.requirement}".`,
    why: "",
  };
}

/** Whole months since a "YYYY-MM(-DD)" date, or null if unparseable. */
function monthsSince(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  const then = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  const now = new Date();
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={`copy-btn ${done ? "done" : ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard blocked — no-op */
        }
      }}
    >
      {done ? "✓ Copied" : `⧉ ${label}`}
    </button>
  );
}

/** Print just one packet: tag <body>, print, untag when the dialog closes. */
function printPacket(cls: string) {
  const b = document.body;
  b.classList.add(cls);
  const cleanup = () => {
    b.classList.remove(cls);
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

const REFER_SECTIONS: { id: string; label: string }[] = [
  { id: "refer-elig", label: "Eligibility" },
  { id: "refer-ready", label: "Before you call" },
  { id: "refer-note", label: "Doctor note" },
  { id: "refer-auth", label: "Refer" },
  { id: "refer-timeline", label: "Timeline" },
];

function Refer({
  trial,
  profile,
  onBack,
}: {
  trial: TrialMatch;
  profile: Profile;
  onBack: () => void;
}) {
  const gaps = trial.criteria.filter(isGap);
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  // Packet B (the full pre-screen profile shared with the study coordinator) is
  // a disclosure — it opens as its own page ONLY after the patient agrees to be
  // referred, never alongside the pre-consent referral prep.
  const [referred, setReferred] = useState(false);
  // What recordDisclosure() actually reported for this authorization (finding
  // #8) — kept so the "prepared" screen can say something true about it
  // instead of a static line that would drift the moment a backend lands.
  const [authOutcome, setAuthOutcome] = useState<DisclosureOutcome | null>(null);

  if (referred) {
    return (
      <div className="scroll">
        <div className="board refer">
          <div className="refer-head">
            <button className="ghost" onClick={onBack}>
              ← Back to matches
            </button>
            <div className="refer-title">
              <a className="nct" href={trial.url} target="_blank" rel="noopener noreferrer">
                {trial.nctId} ↗
              </a>
              <h2>{trial.title}</h2>
              <div className="refer-sub">
                {trial.phase} · {trial.sponsor} · ◎ {trial.factors.nearestSite}
              </div>
            </div>
          </div>
          <div className="auth-done">
            <div className="auth-done__h">✓ Referral prepared</div>
            <p>
              In production, {trial.sponsor} would receive your consented pre-screen packet for {trial.nctId} — a referral-ready candidate you
              initiated, not a row in a purchased list.
            </p>
            {/* The patient reads this, not an engineer — so it says what
                happened to their data, not which function returned what. */}
            <div className="auth-demo">
              {authOutcome && !authOutcome.persisted
                ? `Demo: no data was sent. The record of this authorization — who it names, the ${authOutcome.record.fieldsDisclosed.length} fields and the ${authOutcome.record.criteriaDisclosed.count}-criterion assessment it covers, the purpose, and how long it lasts — was assembled exactly as the real flow would assemble it, and then kept nowhere. This app stores nothing, so there is no copy of it, including for us.`
                : "Demo: no data was actually sent."}
            </div>
          </div>
          {/* "Who to contact" now lives on the prepared screen (Packet A moved to the
              pre-referral screen). Packet B stays inside #refer-packets so its single-
              packet print still works. */}
          <ContactRouting trial={trial} />
          <div id="refer-packets">
            <PacketB trial={trial} profile={profile} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll">
      <div className="board refer">
        <div className="refer-head">
          <button className="ghost" onClick={onBack}>
            ← Back to matches
          </button>
          <div className="refer-title">
            <a className="nct" href={trial.url} target="_blank" rel="noopener noreferrer">
              {trial.nctId} ↗
            </a>
            <h2>{trial.title}</h2>
            <div className="refer-sub">
              {trial.phase} · {trial.sponsor} · ◎ {trial.factors.nearestSite}
            </div>
          </div>
        </div>

        <nav className="refer-nav" aria-label="Referral sections">
          {REFER_SECTIONS.map((s) => (
            <button key={s.id} onClick={() => jump(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="refer-disclaimer">{CONNECT_DISCLAIMER}</div>

        <EligibilityTable trial={trial} />
        <ReadinessChecklist gaps={gaps} />
        {/* Packet A (the note to your OWN doctor) belongs before you authorize — get your
            care team's buy-in first. "Who to contact" moves to the prepared screen. */}
        <div id="refer-note">
          <PacketA trial={trial} />
        </div>
        <ReferralAuthorization
          trial={trial}
          profile={profile}
          onAuthorize={(outcome) => {
            setAuthOutcome(outcome);
            setReferred(true);
          }}
        />
        <ReferTimeline gaps={gaps} trial={trial} />
      </div>
    </div>
  );
}

/* §3 — per-criterion eligibility table (four states + provenance + source link). */
function EligibilityTable({ trial }: { trial: TrialMatch }) {
  const counts = trial.criteria.reduce(
    (acc, c) => {
      acc[critState(c)]++;
      return acc;
    },
    { met: 0, not_met: 0, confirm: 0, unknown: 0 } as Record<CritState, number>,
  );
  const indexed = trial.criteria.map((c, i) => ({ c, i }));
  const attnRows = indexed.filter((x) => critState(x.c) !== "met");
  const metRows = indexed.filter((x) => critState(x.c) === "met");
  const row = ({ c, i }: { c: Criterion; i: number }) => {
    const st = CRIT_STATE_META[critState(c)];
    return (
      <div key={i} className={`ct-row ${st.cls}`}>
        <span className="ct-glyph">{st.glyph}</span>
        <span className="ct-req">
          <span className={`ck ${c.kind}`}>{c.kind}</span> {c.requirement}
          {c.evidence ? <span className="ct-ev">{c.evidence}</span> : null}
        </span>
        <span className="ct-status">{st.label}</span>
        <span className="ct-prov">
          <SourceBadge source={c.provenance ?? "not_documented"} />
        </span>
        <a className="ct-src" href={trial.url} target="_blank" rel="noopener noreferrer" title="See the trial's eligibility criteria on ClinicalTrials.gov">
          source ↗
        </a>
      </div>
    );
  };
  return (
    <section id="refer-elig" className="refer-sec">
      <div className="refer-sec__h">How your record lines up ({trial.criteria.length} criteria)</div>
      <div className="refer-framing">{ELIGIBILITY_FRAMING}</div>
      <div className="ct-tally">
        <span className="met">{counts.met} met</span>
        <span className="confirm">{counts.confirm} to confirm</span>
        <span className="unknown">{counts.unknown} unknown</span>
        {counts.not_met > 0 && <span className="notmet">{counts.not_met} not met</span>}
      </div>
      {/* Met criteria are collapsed by default — the rows that need attention
          (to confirm / unknown / not met) lead; "met" opens on demand. */}
      {attnRows.length > 0 && <div className="ct-table">{attnRows.map(row)}</div>}
      {metRows.length > 0 && (
        <details className="ct-met">
          <summary>
            <span className="ct-met__label">
              {metRows.length} criteri{metRows.length === 1 ? "on" : "a"} you already meet
            </span>
          </summary>
          <div className="ct-table">{metRows.map(row)}</div>
        </details>
      )}
    </section>
  );
}

/* §4 — "Before you call" readiness checklist: gaps → actions, longest lead first. */
function ReadinessChecklist({ gaps }: { gaps: Criterion[] }) {
  const items = gaps.map((c) => ({ c, lead: classifyGap(c) })).sort((a, b) => a.lead.order - b.lead.order);
  return (
    <section id="refer-ready" className="refer-sec">
      <div className="refer-sec__h">
        {items.length > 0 ? `${items.length} thing${items.length > 1 ? "s" : ""} to close before you contact this site` : "You're ready to contact this site"}
      </div>
      {items.length === 0 ? (
        <p className="refer-empty">No open readiness gaps from your record — bring the packet below to your care team to confirm.</p>
      ) : (
        <ol className="ready-list">
          {items.map(({ c, lead }, i) => (
            <li key={i} className="ready-item">
              <div className="ready-top">
                <span className="ready-n">{i + 1}</span>
                <span className="ready-req">{c.requirement}</span>
                <span className="ready-band">{lead.band}</span>
              </div>
              <div className="ready-ask">{lead.ask}</div>
              {lead.why && <div className="ready-why">Why: {lead.why}</div>}
              <CopyButton text={lead.ask} label="Copy this ask" />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* §6 — contact routing + honest staleness. */
function ContactRouting({ trial }: { trial: TrialMatch }) {
  const months = monthsSince(trial.lastUpdatePostDate);
  const stale = months !== null && months >= 3;
  // Nearest site first (best we can do at city/state granularity).
  const sites = [...trial.locations].sort((a, b) => {
    const near = trial.factors.nearestSite;
    const am = `${a.city}, ${a.state}` === near ? 0 : 1;
    const bm = `${b.city}, ${b.state}` === near ? 0 : 1;
    return am - bm;
  });
  // A closed site nearer than an open one must not push the open one past the
  // cap below — see prioritizeOpenSites.
  const orderedSites = prioritizeOpenSites(sites);
  const shownSites = orderedSites.slice(0, 6);
  const hiddenSiteCount = orderedSites.length - shownSites.length;
  const central = trial.contacts;
  const email = central.find((c) => c.email)?.email ?? "";
  const draft = `Subject: Interest in ${trial.nctId} — pre-screening\n\nHello,\n\nI'm a patient interested in ${trial.nctId} (${trial.title}). Working from my own records, my profile appears to line up with several of the published criteria, with a few items to confirm. Could you tell me whether the study is currently enrolling and what the next step would be?\n\nThank you.`;

  return (
    <section id="refer-contacts" className="packet packet-contacts">
      <div className="packet-head">
        <div className="packet-kicker">Who to contact</div>
      </div>
      <div className="packet-body">
        {stale && (
          <div className="stale-warn">
            ⚠ This site's listing was last updated {months} months ago. Call to confirm they&apos;re still enrolling before you rely on it.
          </div>
        )}
        <div className="slot-note">Being eligible isn&apos;t the same as having a slot — in dose-escalation trials a cohort can be full even when you qualify. Ask.</div>

        {central.length > 0 && (
          <div className="contact-group">
            <div className="contact-group__h">Study contacts</div>
            {central.map((c, i) => (
              <div key={i} className="contact-row">
                <span className="contact-name">{c.name}</span>
                {c.phone && <a href={`tel:${c.phone.replace(/[^+\d]/g, "")}`}>{c.phone}</a>}
                {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
              </div>
            ))}
          </div>
        )}

        <div className="contact-group">
          {/* The label has to match the actual order. It is no longer plain
              nearest-first: open sites come first so the cap can't hide one
              behind a closer site nobody there can enroll into. */}
          <div className="contact-group__h">Sites (open ones first, then nearest — matched at city/state level, not exact miles)</div>
          {shownSites.map((s, i) => {
            const open = siteIsRecruiting(s);
            return (
              <div key={i} className="site-row">
                <div className="site-row__top">
                  <span className="site-place">
                    {[s.city, s.state, s.country].filter(Boolean).join(", ") || s.facility}
                  </span>
                  <span className="site-facility">{s.facility}</span>
                  {s.status && (
                    <span className={`mono site-status${open ? "" : " site-status--closed"}`}>{formatSiteStatus(s.status)}</span>
                  )}
                </div>
                {/* The study can be RECRUITING while this particular site is not —
                    say so here, on the row the patient is about to call from. */}
                {!open && (
                  <div className="site-closed-note">
                    This site&apos;s own status is not recruiting. Confirm before counting on a slot here.
                  </div>
                )}
                {s.contacts.length > 0 && (
                  <div className="site-contacts">
                    {s.contacts.map((c, j) => (
                      <div key={j} className="contact-row">
                        <span className="contact-name">{c.name}</span>
                        {c.role && <span className="contact-role mono">{titleCase(c.role)}</span>}
                        {c.phone && <a href={`tel:${c.phone.replace(/[^+\d]/g, "")}`}>{c.phone}</a>}
                        {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {hiddenSiteCount > 0 && <div className="refer-empty">+{hiddenSiteCount} more sites on ClinicalTrials.gov.</div>}
        </div>

        <div className="draft-email">
          <div className="contact-group__h">Draft outreach {email ? `to ${email}` : ""}</div>
          <pre className="draft-body">{draft}</pre>
          <CopyButton text={draft} label="Copy email" />
        </div>
      </div>
    </section>
  );
}

/* §5 Packet A — "Bring this to your oncologist": a ready-to-send note the patient
   hands to their care team to ask about this trial and request a referral. */
function PacketA({ trial }: { trial: TrialMatch }) {
  const gaps = trial.criteria.filter(isGap).length;
  const lineup =
    trial.total > 0
      ? `Working from my own records, my profile appears to line up with ${trial.metCount} of ${trial.total} of the published eligibility criteria${
          gaps > 0 ? `, with ${gaps} item${gaps > 1 ? "s" : ""} left to confirm` : ""
        }. I understand this isn't a determination of eligibility — the study team makes that call.\n\n`
      : "";
  const note = `Subject: Asking about a clinical trial — ${trial.nctId}

Dear Dr. [your doctor's name],

Before my next appointment, I wanted to ask your opinion about a clinical trial I've been looking into:

    ${trial.title}
    ${trial.nctId} · ${trial.phase} · ${trial.sponsor}
    Nearest listed site: ${trial.factors.nearestSite}
    Details: ${trial.url}

${lineup}Could you let me know:
    1. Whether this trial is worth pursuing given my current treatment plan, and
    2. If so, whether you'd be willing to refer me or support a pre-screening?

Thank you,
[Your name]`;

  return (
    <div className="packet packet-a">
      <div className="packet-head">
        <div className="packet-kicker">Packet A · bring this to your oncologist</div>
        <button className="btn packet-print" onClick={() => printPacket("printing-a")}>
          Print
        </button>
      </div>
      <div className="packet-body">
        <h3>Note for your doctor · {trial.nctId}</h3>
        <p className="packet-lead">
          A ready-to-send message asking your care team about this trial and whether they&apos;ll support a referral. Edit the bracketed parts,
          then copy or print it.
        </p>
        <pre className="draft-body">{note}</pre>
        <CopyButton text={note} label="Copy note" />
        <div className="packet-framing">
          A conversation starter, not medical advice or an eligibility determination — your care team decides what&apos;s right for you.
        </div>
      </div>
    </div>
  );
}

/* §5 Packet B — "For the study coordinator": mCODE profile + criterion status. */
function PacketB({ trial, profile }: { trial: TrialMatch; profile: Profile }) {
  const groups: { key: CritState; label: string }[] = [
    { key: "met", label: "Confirmed from record" },
    { key: "confirm", label: "Needs confirmation" },
    { key: "unknown", label: "Unknown / not documented" },
    { key: "not_met", label: "Not met" },
  ];
  return (
    <div className="packet packet-b">
      <div className="packet-head">
        <div className="packet-kicker">Packet B · for the study coordinator</div>
        <button className="btn packet-print" onClick={() => printPacket("printing-b")}>
          Print
        </button>
      </div>
      <div className="packet-body">
        <h3>Pre-screen summary · {trial.nctId}</h3>
        <div className="packet-block">
          <b>Patient profile (mCODE / USCDI+ CTM), provenance on every field:</b>
          <div className="pb-fields">
            {profile.fields.map((f, i) => (
              <div key={i} className="pb-field">
                <span className="pb-k">
                  {f.label}
                  {f.mcode ? <span className="mcode">{f.mcode}</span> : null}
                </span>
                <span className="pb-v">
                  <SourceBadge source={f.source ?? "note"} /> {f.value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="packet-block">
          <b>Criterion-by-criterion status:</b>
          {groups.map((g) => {
            const rows = trial.criteria.filter((c) => critState(c) === g.key);
            if (rows.length === 0) return null;
            return (
              <div key={g.key} className="pb-group">
                <div className={`pb-gh ${g.key}`}>
                  {g.label} ({rows.length})
                </div>
                {rows.map((c, i) => (
                  <div key={i} className="pb-crit">
                    <SourceBadge source={c.provenance ?? "not_documented"} /> <span className={`ck ${c.kind}`}>{c.kind}</span> {c.requirement}
                    {c.evidence ? ` — ${c.evidence}` : ""}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <div className="packet-framing">Pre-screen only. Eligibility is determined by the study team after a screening workup.</div>
      </div>
    </div>
  );
}

/* §7 — referral = the authorization moment (front-end only; synthetic demo). */
function ReferralAuthorization({
  trial,
  profile,
  onAuthorize,
}: {
  trial: TrialMatch;
  profile: Profile;
  onAuthorize: (outcome: DisclosureOutcome) => void;
}) {
  const [stage, setStage] = useState<"idle" | "review">("idle");
  const purpose = `Eligibility pre-screening and contact for possible enrollment in ${trial.nctId}.`;

  // The (future) transmit point (finding #8): this is where a real disclosure
  // to a real sponsor would leave. The record is built from what's actually on
  // screen — the same fields, recipient, and purpose the patient just read —
  // never a hardcoded list, so it can't silently omit something disclosed.
  function handleAuthorize() {
    const record = buildDisclosureRecord({
      authorizationId: crypto.randomUUID(),
      fields: profile.fields,
      // Packet B is what the coordinator receives, and it is not just the
      // profile — it carries the criterion-by-criterion assessment, whose
      // evidence lines quote the record. Listing only the fields would make
      // the ledger describe a smaller disclosure than the one that happened.
      criteria: trial.criteria,
      sponsor: trial.sponsor,
      site: trial.factors.nearestSite,
      nctId: trial.nctId,
      purpose,
      // No referral in this app is ever compensated. lib/disclosure.ts makes
      // that an explicit field rather than a default so a future paid-referral
      // path can't slip through this call site unnoticed.
      compensation: { compensated: false },
      now: Date.now(),
    });
    onAuthorize(recordDisclosure(record));
  }

  return (
    <section id="refer-auth" className="refer-sec">
      <div className="refer-sec__h">Refer me to this study</div>
      {stage === "idle" && (
        <>
          <p className="refer-empty">
            When you refer, we share a specific, itemized set of your data with this one site for this one purpose — not a generic
            &quot;we may share with pharma.&quot; You see exactly what, with whom, and why first.
          </p>
          <button className="btn go" onClick={() => setStage("review")}>
            Review what would be shared →
          </button>
        </>
      )}
      {stage === "review" && (
        <div className="auth-card">
          <div className="auth-row">
            <span className="auth-k">What is disclosed</span>
            {/* The packet is the profile AND the assessment. Naming only the
                fields here would understate the disclosure on the very screen
                where the patient agrees to it. */}
            <span className="auth-v">
              {profile.fields.map((f) => f.label).join(" · ")}
              {trial.criteria.length > 0 ? (
                <>
                  {" · "}
                  <b>
                    plus the {trial.criteria.length}-criterion eligibility assessment for this study
                    {trial.criteria.some((c) => c.evidence) ? ", which quotes your record where it explains a verdict" : ""}
                  </b>
                </>
              ) : null}
            </span>
          </div>
          <div className="auth-row">
            <span className="auth-k">To whom</span>
            <span className="auth-v">{trial.sponsor} · site nearest {trial.factors.nearestSite} ({trial.nctId})</span>
          </div>
          <div className="auth-row">
            <span className="auth-k">Purpose</span>
            <span className="auth-v">{purpose}</span>
          </div>
          <div className="auth-row">
            <span className="auth-k">Terms</span>
            <span className="auth-v">One year · revocable at any time · this trial only.</span>
          </div>
          <div className="auth-row">
            <span className="auth-k">Signature</span>
            <span className="auth-v">Click-through: the button below is what you would be signing with — not a wet or drawn signature.</span>
          </div>
          <div className="auth-row">
            <span className="auth-k">Retention</span>
            {/* Stated as a term of the authorization, in the same conditional
                frame the card's footer sets — not as a claim that anything is
                being kept today, which would be finding #2 all over again. */}
            <span className="auth-v">A real referral would keep this authorization on file for six years, separate from the one-year sharing window above.</span>
          </div>
          <div className="auth-actions">
            <button className="btn go" onClick={handleAuthorize}>
              Authorize &amp; refer
            </button>
            <button className="ghost" onClick={() => setStage("idle")}>
              Cancel
            </button>
          </div>
          <div className="auth-demo">
            Demo: nothing is transmitted and this is synthetic data — clicking Authorize builds exactly the record above (recipient, fields, purpose,
            signature, retention) and hands it to the ledger write the real flow would make. No ledger backend exists yet, so that write does not happen.
          </div>
        </div>
      )}
    </section>
  );
}

/* §8 — timeline (honest estimate). Time is the clinical risk, not a UX nicety. */
function ReferTimeline({ gaps, trial }: { gaps: Criterion[]; trial: TrialMatch }) {
  const expiring: string[] = [];
  if (gaps.some((c) => /imag|scan|\bct\b|mri|recist|measurable|restag/.test(c.requirement.toLowerCase()))) expiring.push("Scan validity — trials often require imaging within ~28 days.");
  if (gaps.some((c) => /lab|cbc|cmp|organ|creatinin|bilirubin|platelet|neutrophil|function/.test(c.requirement.toLowerCase()))) expiring.push("Lab recency — bloodwork typically must be within ~14 days of screening.");
  expiring.push("Cohort slots — dose-escalation cohorts can fill while you wait.");
  return (
    <section id="refer-timeline" className="refer-sec">
      <div className="refer-sec__h">Timeline &amp; what&apos;s expiring</div>
      <p className="refer-empty">
        First contact to first dose is commonly <b>2–8 weeks</b> (estimated). You&apos;re at the very start — initial contact. The window matters:
        after a screen failure, decline while waiting is a real clinical risk, so close the time-sensitive items early.
      </p>
      <div className="enroll-detail" style={{ marginBottom: 10 }}>
        <span className="enroll-k">Enrollment</span>
        <span className="enroll-v">{trial.factors.enrollmentWindow || "status not published — confirm with the site"}</span>
      </div>
      <ul className="expiring-list">
        {expiring.map((e, i) => (
          <li key={i}>◷ {e}</li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
 * RESULTS REVEAL STORYBOARD — the "match-found" moment
 *     0ms   counts row + summary settle in (the eligible number lands)
 *   260ms   result cards stagger up (70ms apart, translateY + fade)
 * A single `stage` integer drives it; reduced-motion skips to the end.
 * (Interface Craft storyboard structure, implemented in CSS per
 *  trial-craft-motion — a predetermined reveal, so no Framer Motion.)
 * ───────────────────────────────────────────────────────── */
const REVEAL = { counts: 20, cards: 260 }; // ms after mount
const CARD_STAGGER = 70; // ms between successive cards

function Results({
  data,
  entrant,
  prefs,
  saved,
  onToggleSave,
  studyFilter,
  statusFilter,
  onStatusFilter,
  phaseFilter,
  query,
  topK,
  flash,
  onResolve,
  recheck,
  onDismissRecheck,
  onOpenNextSteps,
  onOpenFork,
  onRefer,
  showNgsAction,
}: {
  data: MatchResponse;
  /** §5.3 — who is reading. For a clinician this reorders the page, not just
   *  the prose: the ledger leads and the patient-facing framing steps back. */
  entrant: Entrant;
  prefs: Set<PrefKey>;
  saved: Set<string>;
  onToggleSave: (n: string) => void;
  studyFilter: StudyFilter;
  statusFilter: StatusFilter;
  onStatusFilter: (s: StatusFilter) => void;
  phaseFilter: Set<string>;
  query: string;
  topK: TopK;
  flash: string | null;
  onResolve: (nctId: string, critIndex: number, answer: string) => Promise<boolean>;
  recheck: { busy: boolean; note: string | null };
  onDismissRecheck: () => void;
  onOpenNextSteps: () => void;
  onOpenFork: () => void;
  onRefer: (nctId: string) => void;
  showNgsAction: boolean;
}) {
  const { counts, matches, conditionQuery, location } = data;
  const active = prefs.size > 0;
  const clinical = entrant === "clinician";
  // The sample-patient fixture returns hand-authored ledgers attached to real
  // NCT ids and real sponsors. Captioning those "AI-generated", or reporting a
  // live screen that never ran, would be a false statement about how the result
  // on screen was produced — so the curated path says what it is.
  const curated = data.provenance === "curated-demo";
  const [showAllScreened, setShowAllScreened] = useState(false);
  const [logCopied, setLogCopied] = useState(false);

  // The coordinator's takeaway. Everything in it is already on this screen —
  // the log is a transcription, not a second opinion — so it can be pasted into
  // a screening note or a study binder without carrying a claim the UI didn't make.
  async function copyLog() {
    try {
      await navigator.clipboard.writeText(buildScreeningLog(data));
      setLogCopied(true);
      window.setTimeout(() => setLogCopied(false), 1600);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  // Drive the match-found reveal (see REVEAL storyboard above the component).
  const [stage, setStage] = useState(0); // 0 hidden · 1 counts in · 2 cards in
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStage(2);
      return;
    }
    const timers = [setTimeout(() => setStage(1), REVEAL.counts), setTimeout(() => setStage(2), REVEAL.cards)];
    return () => timers.forEach(clearTimeout);
  }, []);
  // "Your next steps" is only meaningful once the patient is fully eligible for at
  // least one trial — those are the ones worth acting on. Uncertain trials still
  // have open questions (surfaced inline on the card); ruled-out trials are moot.
  const eligibleCount = matches.filter((m) => m.status === "eligible").length;

  // Canonical counts (from the single source of truth on the server). These
  // buckets ALWAYS sum to poolTotal, so the header and buckets can never disagree.
  const excludedCount = counts.excluded ?? 0;
  // Which terms actually contributed studies — a failed or empty leg is not
  // coverage and must not be counted as if it were.
  const searchTerms = (data.coverage?.terms ?? []).filter((t) => !t.error && t.added > 0).map((t) => t.term);
  const bucketCounts: Record<MatchStatus, number> = {
    eligible: counts.eligible,
    uncertain: counts.uncertain,
    near: counts.near,
    screened: counts.screened,
    excluded: excludedCount,
  };
  const reconTotal = counts.eligible + counts.uncertain + counts.near + counts.screened + excludedCount;

  // Shared refine facets (search · study type · phase) apply to every section.
  const facet = (m: TrialMatch) => passesFacets(m, studyFilter, phaseFilter, query);
  const statusOk = (m: TrialMatch) => statusFilter === "all" || m.status === statusFilter;

  const consider = matches.filter((m) => (m.status === "eligible" || m.status === "uncertain") && facet(m) && statusOk(m));
  const screened = matches.filter((m) => m.status === "screened" && facet(m) && statusOk(m));
  const excluded = matches.filter((m) => m.status === "excluded" && facet(m) && statusOk(m));

  // §P1 — every "near" match splits into the workable ones (every failing
  // criterion is remediable: a washout that elapses, a scan that gets ordered)
  // and the ones with at least one fixed failure. Same status, same "near"
  // bucket count — this only decides which of two sections a card renders in.
  const nearMatches = matches.filter((m) => m.status === "near" && facet(m) && statusOk(m));
  const { notYet, ruledOut: ruledOutUnsorted } = splitNearMisses(nearMatches);
  // Within "ruled out" proper, a study closer to workable (fewer hard failures)
  // is still worth reading before one that is fixed shut on every count.
  const ruledOut = [...ruledOutUnsorted].sort((a, b) => hardFailCountOf(a.criteria) - hardFailCountOf(b.criteria));

  // Fully-eligible studies always rank first for clear visibility; within the same
  // status, the existing preference/fit ranking still applies.
  const statusRank = (m: TrialMatch) => (m.status === "eligible" ? 0 : 1);
  const ordered = [...consider].sort(
    // Final tiebreak uses the SAME comparator the server ranked with, so a
    // client-side re-sort can never disagree with the order the results arrived in.
    (a, b) => statusRank(a) - statusRank(b) || (active ? prefScore(b, prefs) - prefScore(a, prefs) : 0) || compareMatches(a, b),
  );

  // Geography: when the server actually ran distance filtering, split the ranked
  // list into within-range and farther. Nothing is dropped — far trials collapse below.
  const grouped = location.applied;
  const inRangeAll = grouped ? ordered.filter((m) => m.factors.withinRange === true) : ordered;
  const fartherAll = grouped ? ordered.filter((m) => m.factors.withinRange !== true) : [];

  // top-k caps the ranked (in-range) list the user is scanning first.
  const inRange = limitK(inRangeAll, topK);
  const farther = fartherAll;
  const rankedHidden = inRangeAll.length - inRange.length;

  // §4.2 behavior: when distance grouping ran but nothing is in-range, don't show
  // an empty list behind a collapsed "Farther" toggle — auto-open it and say so.
  const emptyInRange = grouped && inRangeAll.length === 0 && fartherAll.length > 0;

  const totalShown = inRange.length + farther.length + notYet.length + ruledOut.length + screened.length + excluded.length;
  const filtersActive = statusFilter !== "all" || studyFilter !== "all" || phaseFilter.size > 0 || query.trim().length > 0;

  const card = (m: TrialMatch, i: number) => (
    <DecisionCard
      key={m.nctId}
      m={m}
      entrant={entrant}
      saved={saved.has(m.nctId)}
      onSave={() => onToggleSave(m.nctId)}
      reasons={active ? prefReasons(m, prefs) : []}
      flash={flash === m.nctId}
      onResolve={onResolve}
      onOpenNextSteps={onOpenNextSteps}
      onRefer={onRefer}
      revealIndex={i}
      revealActive={stage >= 2}
    />
  );

  const SCREENED_PREVIEW = 8;
  const screenedShown = showAllScreened ? screened : screened.slice(0, SCREENED_PREVIEW);

  return (
    <div className="scroll">
      <div className="board board--results" data-reveal={stage} style={{ "--card-stagger": `${CARD_STAGGER}ms` } as React.CSSProperties}>
        <div className="board-head">
          <h2>{clinical ? "Screening results" : "Matches for you"}</h2>
          <div className="board-head-r">
            {clinical && (
              <button className="nextsteps-btn" onClick={copyLog} title="Copy a plain-text screening log for this patient — one line per study, with the open items.">
                {logCopied ? "Copied" : "Copy screening log"}
              </button>
            )}
            {!clinical && eligibleCount > 0 && (
              <button className="nextsteps-btn" onClick={onOpenNextSteps}>
                Your next steps <span className="ns-count">{eligibleCount}</span>
              </button>
            )}
          </div>
        </div>

        {/* Background re-check status — never silent: says what's happening / what changed. */}
        {(recheck.busy || recheck.note) && (
          <div className={`recheck-banner ${recheck.busy ? "busy" : "done"}`} role="status" aria-live="polite">
            <span className="rb-dot" aria-hidden="true" />
            <span className="rb-text">{recheck.note}</span>
            {!recheck.busy && recheck.note && (
              <button className="rb-x" onClick={onDismissRecheck} aria-label="Dismiss">
                ✕
              </button>
            )}
          </div>
        )}

        {/* Stat line leads — the counts that matter, not a paragraph of prose. */}
        <p className="board-sub">
          {curated ? (
            <>
              <b>{counts.poolTotal} hand-authored example studies</b> for <span className="mono">{conditionQuery}</span> · no registry search
              and no model call ran for this sample patient
            </>
          ) : (
            <>
              Screened <b>{counts.poolTotal} recruiting trials</b> for <span className="mono">{conditionQuery}</span>
              {/* How wide the net was is part of the claim: "we searched" means
                  little without saying across how many terms. */}
              {searchTerms.length > 1 ? (
                <>
                  {" "}
                  <span title={searchTerms.join(" · ")}>and {searchTerms.length - 1} related terms</span>
                </>
              ) : null}{" "}
              · reasoned the top <b>{counts.reasoned}</b> in depth
              {excludedCount > 0 ? (
                <>
                  {" "}
                  · <b>{excludedCount}</b> ruled out on published age/sex criteria
                </>
              ) : null}
            </>
          )}
          {filtersActive ? (
            <>
              {" "}
              · showing <b>{totalShown}</b> after filters
            </>
          ) : null}
        </p>

        {/* Status buckets promoted to the primary summary + filter, directly under the stat line. */}
        <div className="counts">
          {COUNT_BUCKETS.map((b) => (
            <button
              key={b.key}
              className={`count ${b.cls} ${statusFilter === b.key ? "on" : ""}`}
              aria-pressed={statusFilter === b.key}
              onClick={() => onStatusFilter(statusFilter === b.key ? "all" : b.key)}
            >
              <span className="count-dot" aria-hidden />
              <b>{bucketCounts[b.key]}</b> {b.label}
            </button>
          ))}
          <span className="count total" title="Every bucket sums to the total screened.">
            <b>{reconTotal}</b> screened total
          </span>
          {statusFilter !== "all" && (
            <button className="count clear-status" onClick={() => onStatusFilter("all")}>
              show all ✕
            </button>
          )}
        </div>

        {/* Non-directive framing — kept, but demoted from stat-weight prose to a quiet line. */}
        <p className="board-reassure">
          These are worth discussing with your care team — nothing here is a recommendation; it&apos;s to help you weigh the options and know
          what to ask.
        </p>

        {/* Box soup collapsed: the AI caveat and location status become quiet inline captions. */}
        <div className="board-notes">
          <span className="bn ai">
            <span className="bn-ic" aria-hidden>
              ⓘ
            </span>{" "}
            {curated
              ? "Curated demo result for the sample patient — illustrative, not a live eligibility screen."
              : "AI-generated eligibility — not a determination; only a study team can confirm you qualify."}
          </span>
          <span className={`bn loc ${location.applied ? "on" : ""}`}>
            <span className="bn-ic" aria-hidden>
              ◎
            </span>{" "}
            {location.applied ? (
              <>
                Near <b>{location.label}</b> ({travelLabel(location.travel)}) — farther trials kept below, never dropped.
              </>
            ) : (
              <>No distance limit — showing trials anywhere.</>
            )}
          </span>
        </div>

        {/* §5.2 — NGS gap reframed as an action, not a dead end. Demoted to a lighter inline nudge. */}
        {showNgsAction && (
          <div className="ngs-action">
            <span className="ngs-action__ic" aria-hidden>
              ⊕
            </span>
            <div className="ngs-action__body">
              <div className="ngs-action__h">Getting genomic testing could open more trials</div>
              <p>
                You haven&apos;t had comprehensive genomic (NGS) testing on record. Many trials screen on specific tumor alterations — testing
                like <b>FoundationOne</b>, <b>Guardant360</b>, <b>Tempus xT</b>, or <b>MSK-IMPACT</b> could open biomarker-selected trials you
                can&apos;t be screened for yet. Ask your oncologist whether NGS testing is right for you, and bring the results back to re-run
                this search.
              </p>
            </div>
          </div>
        )}

        {/* The Fork prompt (intake-prd §6.1) — the differentiator. Only surfaced
            once the patient has fully matched (at least one Eligible trial); hidden
            when everything is still "Needs info" or ruled out. */}
        {counts.eligible > 0 && (
          <button className="fork-prompt" onClick={onOpenFork}>
            <div className="fork-prompt__body">
              <div className="fork-prompt__h">Has your care team recommended what&apos;s next?</div>
              <div className="fork-prompt__d">
                Some treatments close doors. See which of these trials a next line of treatment would keep open — or close — before your next
                appointment.
              </div>
            </div>
            <span className="fork-prompt__go">See what&apos;s at stake →</span>
          </button>
        )}

        {totalShown === 0 && (
          <div className="empty-note">
            No trials match the current filters.{" "}
            {filtersActive ? "Try clearing a filter in the sidebar or the status buckets above." : ""}
          </div>
        )}

        {(statusFilter === "all" || statusFilter === "eligible" || statusFilter === "uncertain") && (
          <>
            {emptyInRange && <div className="empty-range">No matches near you — here are the closest.</div>}

            {inRange.map(card)}

            {rankedHidden > 0 && (
              <div className="topk-note">
                {rankedHidden} more ranked match{rankedHidden > 1 ? "es" : ""} hidden by the “Show ranked” limit — raise it in the sidebar.
              </div>
            )}

            {farther.length > 0 && (
              <details className="farther" open={emptyInRange}>
                <summary>
                  Farther from you ({farther.length}) <span>— beyond your travel range, kept just in case</span>
                </summary>
                <div className="farther-list">{farther.map(card)}</div>
              </details>
            )}
          </>
        )}

        {/* §P1 — the workable half of "near": every failing criterion here is one
            the patient could come to satisfy. Sits above "Ruled out" because it is
            categorically different, not because it is more likely — the card
            summary says what's in the way without opening it, and the copy frames
            possibility only. No dates, no "almost", nothing that reads as a plan;
            the study team still decides. */}
        {notYet.length > 0 && (statusFilter === "all" || statusFilter === "near") && (
          <>
            <div className="section-h">
              Not open to you yet ({notYet.length}) <span>— every criterion listed here is one that could still change</span>
            </div>
            {notYet.map((m) => (
              <details key={m.nctId} className="ruled-collapse notyet-collapse">
                <summary className="ruled-summary notyet-summary">
                  <div className="notyet-row">
                    <span className="ruled-chev" aria-hidden>
                      ▶
                    </span>
                    <span className="ruled-dot notyet-dot" aria-hidden />
                    <span className="ruled-tag notyet-tag">Not yet</span>
                    <span className="mono ruled-nct">{m.nctId}</span>
                    <span className="ruled-title">{m.title}</span>
                    <span className="mono ruled-phase">{m.phase}</span>
                  </div>
                  <div className="notyet-why">Could change: {notYetWhy(m.criteria)}</div>
                </summary>
                <div className="ruled-body">
                  <DecisionCard
                    m={m}
                    entrant={entrant}
                    saved={saved.has(m.nctId)}
                    onSave={() => onToggleSave(m.nctId)}
                    reasons={active ? prefReasons(m, prefs) : []}
                    flash={flash === m.nctId}
                    onResolve={onResolve}
                    onOpenNextSteps={onOpenNextSteps}
                    onRefer={onRefer}
                    hideHead
                  />
                </div>
              </details>
            ))}
          </>
        )}

        {ruledOut.length > 0 && (statusFilter === "all" || statusFilter === "near") && (
          <>
            <div className="section-h">
              Ruled out ({ruledOut.length}) <span>— collapsed; open one to see why it fails</span>
            </div>
            {ruledOut.map((m) => (
              <details key={m.nctId} className="ruled-collapse">
                <summary className="ruled-summary">
                  <span className="ruled-chev" aria-hidden>
                    ▶
                  </span>
                  <span className="ruled-dot" aria-hidden />
                  <span className="ruled-tag">Ruled out</span>
                  <span className="mono ruled-nct">{m.nctId}</span>
                  <span className="ruled-title">{m.title}</span>
                  <span className="mono ruled-phase">{m.phase}</span>
                </summary>
                <div className="ruled-body">
                  <DecisionCard
                    m={m}
                    entrant={entrant}
                    saved={saved.has(m.nctId)}
                    onSave={() => onToggleSave(m.nctId)}
                    reasons={active ? prefReasons(m, prefs) : []}
                    flash={flash === m.nctId}
                    onResolve={onResolve}
                    onOpenNextSteps={onOpenNextSteps}
                    onRefer={onRefer}
                    hideHead
                  />
                </div>
              </details>
            ))}
          </>
        )}

        {/* Structural exclusions: decided from the registry's own age/sex fields,
            in code, before any model call. Listed with the reason rather than
            hidden — "we looked and here is why not" is the honest form. */}
        {excluded.length > 0 && (statusFilter === "all" || statusFilter === "excluded") && (
          <>
            <div className="section-h">
              Not open to you ({excluded.length}) <span>— the study&apos;s published age or sex criteria rule these out; no AI judgment involved</span>
            </div>
            <div className="screened-list">
              {excluded.map((m) => (
                <a key={m.nctId} className="screened-row" href={m.url} target="_blank" rel="noopener noreferrer">
                  <span className="mono">{m.nctId}</span>
                  <span className="sr-title">{m.title}</span>
                  <span className="sr-why">{m.structuralExclusion}</span>
                </a>
              ))}
            </div>
          </>
        )}

        {screened.length > 0 && (statusFilter === "all" || statusFilter === "screened") && (
          <>
            <div className="section-h">
              Not yet reasoned ({screened.length}) <span>— matched your condition &amp; recruiting filters, not deeply reasoned this pass</span>
            </div>
            <div className="screened-list">
              {screenedShown.map((m) => (
                <a key={m.nctId} className="screened-row" href={m.url} target="_blank" rel="noopener noreferrer">
                  <span className="mono">{m.nctId}</span>
                  <span className="sr-title">{m.title}</span>
                  <span className="mono sr-phase">{m.phase}</span>
                </a>
              ))}
            </div>
            {screened.length > SCREENED_PREVIEW && (
              <button className="ghost show-more" onClick={() => setShowAllScreened((v) => !v)}>
                {showAllScreened ? "Show fewer" : `Show all ${screened.length}`}
              </button>
            )}
          </>
        )}

        <div className="disclaimer" style={{ marginTop: 20 }}>
          Informational decision support to review with your care team — not medical advice, and it does not choose for you. Trial data is live
          from ClinicalTrials.gov; synthetic personas only in this demo.
        </div>
      </div>
    </div>
  );
}

/* ---- one trial as a decision card: brief-first, ledger grouped behind an accordion ---- */

const DecisionCard = memo(function DecisionCard({
  m,
  entrant,
  saved,
  onSave,
  reasons,
  flash,
  onResolve,
  onOpenNextSteps,
  onRefer,
  hideHead = false,
  revealIndex = 0,
  revealActive = true,
}: {
  m: TrialMatch;
  entrant: Entrant;
  saved: boolean;
  onSave: () => void;
  reasons: string[];
  flash: boolean;
  onResolve: (nctId: string, critIndex: number, answer: string) => Promise<boolean>;
  onOpenNextSteps: () => void;
  onRefer: (nctId: string) => void;
  hideHead?: boolean;
  /** Match-found reveal: stagger order + whether the reveal has fired.
   *  Defaults keep the card fully visible for any non-reveal usage. */
  revealIndex?: number;
  revealActive?: boolean;
}) {
  const label = m.status === "eligible" ? "Eligible" : m.status === "uncertain" ? "Needs info" : "Ruled out";
  const near = m.status === "near";
  // A coordinator's job on this card is the opposite of a patient's. The patient
  // is deciding whether to want the trial, so the plain-language brief leads and
  // the criterion ledger sits one click away. The coordinator already wants it —
  // their question is "what is still missing and where do I get it", which is the
  // ledger. So for a clinician the two swap places. No eligibility rule changes.
  const clinical = entrant === "clinician";
  // A caregiver's question is not "do I want this" (the patient's question,
  // which the brief below still answers for them) but "is this doable" — how
  // far, how demanding, what's actually scheduled. The brief stays exactly
  // where it is; this only adds the logistics row further down. No eligibility
  // rule changes here either — same invariant as `clinical` above.
  const caring = entrant === "caregiver";
  // Open items, in the order a coordinator works them: the ones nothing in the
  // record addresses first, since those are the phone calls.
  const openItems = m.criteria
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c.verdict === "confirm")
    .sort((a, b) => Number(b.c.provenance === "not_documented") - Number(a.c.provenance === "not_documented"));
  // Referral is offered ONLY for trials the patient has fully met eligibility for
  // (Eligible) — never for "Needs info"/uncertain, where eligibility isn't established.
  const canRefer = m.status === "eligible";
  const tally = ledgerTally(m.criteria);
  // Lazy-render the ledger body: it's the densest part of the page, so we only
  // build its rows when the accordion is actually open (near-misses open by default).
  const [ledgerOpen, setLedgerOpen] = useState(near || clinical);
  const enroll = m.factors.enrollmentWindow;
  const enrollUrgent = near || m.status === "uncertain";
  // Condensed enrollment chip: lead segment ("Open now") as the label, full
  // window + note revealed on click. The window string always leads with status.
  const [enrollOpen, setEnrollOpen] = useState(false);
  const enrollHead = enroll ? enroll.split(" · ")[0] : "";

  return (
    <div
      id={`trial-${m.nctId}`}
      className={`dcard ${m.status}${flash ? " flash" : ""}`}
      data-rev={revealActive ? "in" : "out"}
      style={{ "--rev-i": revealIndex } as React.CSSProperties}
    >
      {!hideHead && (
      <div className="dc-head">
        <div className="dc-title">
          {/* Verdict leads the card — always visible, reinforced by the left status rail. */}
          <div className={`dc-status ${m.status}`}>
            <span className="dc-dot" aria-hidden />
            {label}
          </div>
          <div className="mt">{m.title}</div>
          {/* Registry code, phase, design + site demoted to a single mono sub-line. */}
          <div className="dc-sub">
            <span>{m.phase}</span>
            <span className="sep" aria-hidden>
              ·
            </span>
            <span>◎ {m.factors.nearestSite}</span>
            <span className="sep" aria-hidden>
              ·
            </span>
            <a className="nct" href={m.url} target="_blank" rel="noopener noreferrer">
              {m.nctId} ↗
            </a>
          </div>
        </div>
        {/* Enrollment window stays top-right — time-sensitive, belongs by the title. */}
        {enroll && (
          <button
            type="button"
            className={`enroll-chip ${enrollUrgent ? "urgent" : ""}`}
            onClick={() => setEnrollOpen((o) => !o)}
            aria-expanded={enrollOpen}
            title="Enrollment window — click for details"
          >
            <span className="enroll-chip__ic" aria-hidden>
              ◷
            </span>
            {enrollHead}
          </button>
        )}
      </div>
      )}

      {m.headline && <div className="headline">{m.headline}</div>}

      {/* Full enrollment window + note, revealed from the condensed top-right chip. */}
      {enroll && enrollOpen && (
        <div className={`enroll-detail ${enrollUrgent ? "urgent" : ""}`}>
          <span className="enroll-k">Enrollment</span>
          <span className="enroll-v">{enroll}</span>
          {enrollUrgent && <span className="enroll-note">check this window against any “confirm first” steps below</span>}
        </div>
      )}

      {reasons.length > 0 && <div className="why">▲ moved up: {reasons.join(" · ")}</div>}

      {/* CLINICIAN LEAD — the screening worklist. Every open item, what the record
          says about it today, and where the answer would have to come from. This
          is the artifact a coordinator actually leaves with; it is derived purely
          from the ledger, so it can never disagree with it. */}
      {clinical && openItems.length > 0 && (
        <div className="worklist">
          <div className="worklist-h">
            To obtain before screening <span className="worklist-n">{openItems.length}</span>
          </div>
          <ul>
            {openItems.map(({ c, i }) => (
              <li key={i}>
                <span className="wl-req">{c.requirement}</span>
                <SourceBadge source={c.provenance ?? "not_documented"} />
                {c.evidence && <span className="wl-ev">{c.evidence}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* For a clinician the patient-facing framing is still available, but it is
          reference material rather than the lead — they are not the addressee. */}
      {!near && m.brief && clinical && (
        <details className="brief-d">
          <summary>Patient-facing framing</summary>
          <div className="brief-d__body">
            <div className="offer">
              <div className="offer-k">Benefits of the study</div>
              <div className="offer-v">{m.brief.offers}</div>
            </div>
            <div className="tradeoffs">
              <div className="tcol ask">
                <div className="tk">Expectations of the study</div>
                <div className="tv">{m.brief.commitment}</div>
              </div>
              <div className="tcol unc">
                <div className="tk">Additional Information</div>
                <div className="tv">{m.brief.uncertainty}</div>
              </div>
            </div>
          </div>
        </details>
      )}

      {!near && m.brief && !clinical && (
        <>
          {/* "Could offer" gets the lead — full width, larger; the two trade-offs step down to a quieter pair. */}
          <div className="offer">
            <div className="offer-k">Benefits of the study</div>
            <div className="offer-v">{m.brief.offers}</div>
          </div>
          <div className="tradeoffs">
            <div className="tcol ask">
              <div className="tk">Expectations of the study</div>
              <div className="tv">{m.brief.commitment}</div>
            </div>
            <div className="tcol unc">
              <div className="tk">Additional Information</div>
              <div className="tv">{m.brief.uncertainty}</div>
            </div>
          </div>
          {/* Only surface these once the patient has actually matched (Eligible) —
              premature on "Needs info" cards where eligibility isn't established yet. */}
          {m.status === "eligible" && m.brief.questionsToAsk.length > 0 && (
            <div className="qask">
              {/* Caregiver is the one who will actually be asking these — address
                  them directly rather than the generic "your care team", which
                  reads as if the patient is the one holding the list. */}
              <div className="qask-h">{caring ? "Questions to ask your loved one's care team" : "Questions to ask your care team"}</div>
              <ul>
                {m.brief.questionsToAsk.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* CAREGIVER ADDITION — logistics, not a swap, and deliberately BELOW the
          brief rather than above it. You cannot weigh "is the travel worth it"
          before you know what is on offer, so the brief still leads and this
          answers the second question. The brief above answers "do we want this";
          this answers "is it doable",
          promoting exactly the fields DecisionFactors already computes.
          Unconditional on match status (unlike the brief, which hides on a
          near-miss): whether a site travels or a study demands much of a
          patient is true regardless of whether they qualify for it, and
          "nothing silently dropped" applies to this reader too. */}
      {caring && (
        <div className="logistics">
          <div className="logistics-h">Trial logistics</div>
          <div className="logistics-grid">
            <div className="lg-item">
              <span className="lg-k">Nearest listed site</span>
              <span className="lg-v" title="Approximate — matched on city/state, not an exact distance.">
                {m.factors.nearestSite}
              </span>
              {m.factors.locationUnknown ? (
                <span className="lg-note">This study lists no site we could match to the location you gave.</span>
              ) : !m.factors.nearestSiteActive ? (
                <span className="lg-note">This site is not currently listed as recruiting — confirm before planning around it.</span>
              ) : m.factors.withinRange === true ? (
                <span className="lg-note">Within the travel distance you selected.</span>
              ) : m.factors.withinRange === false ? (
                <span className="lg-note">Outside the travel distance you selected.</span>
              ) : (
                <span className="lg-note">Travel distance was not checked.</span>
              )}
            </div>
            <div className="lg-item">
              <span className="lg-k">Day-to-day demand</span>
              <span className="lg-v">{BURDEN_LABEL[m.factors.burdenProxy]}</span>
              <span className="lg-note" title="A rough estimate from the study's phase and type — not a count of visits.">
                A rough estimate, not a visit count
              </span>
            </div>
            <div className="lg-item">
              <span className="lg-k">Study design</span>
              <span className="lg-v">
                {m.factors.randomized ? "Randomized — a placebo or unassigned arm is possible" : "Open-label — no random assignment"}
              </span>
              {!m.interventional && <span className="lg-note">Observational: it gathers information; no treatment is given.</span>}
            </div>
            {(enroll || (m.factors.registryStale && m.factors.registryAgeDays !== null)) && (
              <div className="lg-item">
                <span className="lg-k">Timing</span>
                {enroll && <span className="lg-v">{enroll}</span>}
                {m.factors.registryStale && m.factors.registryAgeDays !== null && (
                  <span className="lg-note">
                    Registry entry {monthsAgo(m.factors.registryAgeDays)} old — may not reflect whether the study is still enrolling.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Design / commitment signals only — identity (phase · site · NCT) lives in the sub-line above. */}
      <div className="factors">
        <span className="fchip">{m.factors.randomized ? "Randomized / placebo possible" : "Open-label"}</span>
        {m.factors.locationUnknown && (
          <span className="fchip warn" title="This study lists no site we could place against your location.">
            location not verified
          </span>
        )}
        {/* A study can be RECRUITING while every listed site is withdrawn,
            suspended or finished. Say so — otherwise the site line above reads
            as an invitation to a door that is shut. */}
        {!m.factors.nearestSiteActive && !m.factors.locationUnknown && (
          <span className="fchip warn" title="The registry lists no site whose own status is currently recruiting. Confirm with the study contact before travelling.">
            no site listed as recruiting
          </span>
        )}
        {/* Registry freshness: a stale record is the only published signal that a
            study may have stopped enrolling without updating its status. */}
        {m.factors.registryStale && m.factors.registryAgeDays !== null && (
          <span className="fchip warn" title="ClinicalTrials.gov records are updated by the study team. A record this old may not reflect whether the study is still enrolling.">
            registry entry {monthsAgo(m.factors.registryAgeDays)} old
          </span>
        )}
        {!m.interventional && <span className="fchip">Observational</span>}
      </div>

      {m.criteria.length > 0 && (
        <details className="ledger-d" open={near || clinical} onToggle={(e) => setLedgerOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>
            <span className="lsum-label">Eligibility reasoning</span>
            <span className="lsum-tally">
              {tally.met > 0 && <span className="t meets">{tally.met} met</span>}
              {tally.confirm > 0 && <span className="t unc">{tally.confirm} pending</span>}
              {tally.fails > 0 && <span className="t fails">{tally.fails} not met</span>}
            </span>
          </summary>
          {ledgerOpen && (
            <Ledger
              criteria={m.criteria}
              entrant={entrant}
              onResolve={(critIndex, answer) => onResolve(m.nctId, critIndex, answer)}
              onOpenNextSteps={onOpenNextSteps}
            />
          )}
        </details>
      )}

      {/* Actions demoted from the title row to a footer; sponsor sits quietly alongside. */}
      <div className="dc-foot">
        <span className="dc-sponsor">{m.sponsor}</span>
        <div className="dc-actions">
          <button className={`save ${saved ? "on" : ""}`} onClick={onSave}>
            {saved ? "★ Saved" : "☆ Save to discuss"}
          </button>
          {canRefer && (
            <button className="refer-btn" onClick={() => onRefer(m.nctId)}>
              Prepare referral →
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

/* ---- the criterion ledger — grouped by verdict + filterable (the hierarchy) ---- */

type Group = "confirm" | "fails" | "met";
const GROUP_META: { key: Group; label: string; cls: string }[] = [
  { key: "confirm", label: "Pending", cls: "unc" },
  { key: "fails", label: "Not met", cls: "fails" },
  { key: "met", label: "Met", cls: "meets" },
];
function groupOf(v: Verdict): Group {
  return v === "confirm" ? "confirm" : v === "fails" ? "fails" : "met";
}
function ledgerTally(criteria: Criterion[]) {
  return {
    met: criteria.filter((c) => c.verdict === "meets" || c.verdict === "clear").length,
    confirm: criteria.filter((c) => c.verdict === "confirm").length,
    fails: criteria.filter((c) => c.verdict === "fails").length,
  };
}

function Ledger({
  criteria,
  entrant,
  onResolve,
  onOpenNextSteps,
}: {
  criteria: Criterion[];
  entrant: Entrant;
  onResolve: (critIndex: number, answer: string) => Promise<boolean>;
  onOpenNextSteps: () => void;
}) {
  const [only, setOnly] = useState<Group | null>(null);
  // The "Met" group collapses by default (the passing criteria) — it opens on
  // demand, or automatically when the filter is narrowed to Met only.
  const [metOpen, setMetOpen] = useState(false);
  // Carry each criterion's ORIGINAL index so a resolve targets the right row even
  // after grouping reorders them.
  const groups: Record<Group, { c: Criterion; idx: number }[]> = { confirm: [], fails: [], met: [] };
  criteria.forEach((c, idx) => groups[groupOf(c.verdict)].push({ c, idx }));
  const shown = GROUP_META.filter((g) => groups[g.key].length > 0 && (!only || only === g.key));

  return (
    <div className="ledger">
      <div className="ledger-filter">
        {GROUP_META.filter((g) => groups[g.key].length > 0).map((g) => (
          <button key={g.key} className={`lchip ${g.cls} ${only === g.key ? "on" : ""}`} onClick={() => setOnly(only === g.key ? null : g.key)}>
            <b>{groups[g.key].length}</b> {g.label}
          </button>
        ))}
        {only && (
          <button className="lchip clear" onClick={() => setOnly(null)}>
            show all
          </button>
        )}
      </div>
      {shown.map((g) => {
        const rows = groups[g.key].map(({ c, idx }) => (
          <LedgerRow key={idx} c={c} index={idx} entrant={entrant} onResolve={onResolve} onOpenNextSteps={onOpenNextSteps} />
        ));
        if (g.key === "met") {
          return (
            <details
              className="lgroup lgroup--met"
              key={g.key}
              open={metOpen || only === "met"}
              onToggle={(e) => setMetOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className={`lgh ${g.cls}`}>
                {g.label} · {groups[g.key].length}
              </summary>
              {rows}
            </details>
          );
        }
        return (
          <div className="lgroup" key={g.key}>
            <div className={`lgh ${g.cls}`}>
              {g.label} · {groups[g.key].length}
            </div>
            {rows}
          </div>
        );
      })}
    </div>
  );
}

function LedgerRow({
  c,
  index,
  entrant,
  onResolve,
  onOpenNextSteps,
}: {
  c: Criterion;
  index: number;
  entrant: Entrant;
  onResolve: (critIndex: number, answer: string) => Promise<boolean>;
  onOpenNextSteps: () => void;
}) {
  const cls = verdictRowClass(c.verdict);
  // A clinician's ledger is already dense reference material and the reader
  // doesn't need "measurable disease means…" spelled out — the gloss is a
  // patient/caregiver aid only. Same criteria, same verdicts either way; this
  // only changes what renders, never what was decided.
  const showGloss = entrant !== "clinician";
  const resolvable = c.verdict === "confirm";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fid = `cf-${index}`;

  async function submit() {
    const answer = draft.trim();
    if (!answer || busy) return;
    setBusy(true);
    setError(null);
    try {
      // On success the criterion moves to its new verdict group and this row
      // unmounts — no need to reset local state.
      await onResolve(index, answer);
      setOpen(false);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <div className={`crow ${cls}${open ? " editing" : ""}`}>
      <div className="crow-main">
        <span className="cd">{verdictGlyph(c.verdict)}</span>
        <span className={`ck ${c.kind}`}>{c.kind}</span>
        <span className="cx">
          {c.requirement}
          {/* On a failure, the coordinator's first question is whether this is a
              "no" or a "not yet". Say which — it is the difference between
              abandoning a study and diarising it. */}
          {c.verdict === "fails" && (
            <span className={`cfix ${c.remediable ? "soft" : "hard"}`}>
              {c.remediable ? "could change" : "fixed for you"}
            </span>
          )}
          {c.evidence ? <span className="ev">{c.evidence}</span> : null}
          {showGloss && c.gloss && (
            <details className="lgloss">
              <summary>what does this mean?</summary>
              <div className="lgloss__body">{c.gloss}</div>
            </details>
          )}
        </span>
        {resolvable ? (
          <button
            className={`verdict confirm-btn${open ? " on" : ""}`}
            aria-expanded={open}
            aria-controls={fid}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "cancel" : "confirm"}
          </button>
        ) : (
          <span className="verdict">{c.verdict}</span>
        )}
      </div>

      {resolvable && open && (
        <div className="confirm-form" id={fid}>
          <label className="cf-q" htmlFor={`${fid}-a`}>
            Add what you know
            {c.evidence ? <span className="cf-why"> — {c.evidence}</span> : null}
          </label>
          <div className="cf-chips">
            {["Yes", "No", "Not sure"].map((chip) => (
              <button type="button" key={chip} className="cf-chip" disabled={busy || draft.trim().length > 0} onClick={() => setDraft(chip)}>
                {chip}
              </button>
            ))}
          </div>
          <textarea
            id={`${fid}-a`}
            className="cf-input"
            rows={2}
            value={draft}
            placeholder="e.g. Yes — my oncologist ordered these during routine care in March."
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
          />
          {error && <div className="cf-error">{error}</div>}
          <div className="cf-actions">
            <button className="cf-submit" onClick={submit} disabled={busy || !draft.trim()}>
              {busy ? "Re-checking…" : "Submit"}
            </button>
            <button
              className="cf-defer"
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onOpenNextSteps();
              }}
            >
              I don&apos;t have this yet — add to Next Steps
            </button>
          </div>
          <p className="cf-note">Your answer is saved to your profile and used to re-check every trial. It never gets guessed into a pass or fail.</p>
        </div>
      )}
    </div>
  );
}

/* ---- verdict → visual mapping ---- */
function verdictRowClass(v: Verdict): string {
  return v === "fails" ? "fails" : v === "confirm" ? "unc" : "meets";
}
function verdictGlyph(v: Verdict): string {
  return v === "fails" ? "✕" : v === "confirm" ? "?" : "✓";
}

/* ---- resolving a "confirm": state updates that reconcile with the server ---- */

/* Turn a criterion requirement into a short profile field label (told-by-you). */
function confirmFieldLabel(requirement: string): string {
  const s = requirement.trim().replace(/\s+/g, " ");
  return s.length > 48 ? `${s.slice(0, 46)}…` : s;
}

/* Apply re-judged verdicts to specific criterion indices of one trial, then
   re-derive that trial's status and met tally from the SAME shared logic the
   server used — so a resolved "confirm" reconciles exactly, never drifts. */
function applyReverdicts(
  prev: MatchResponse | null,
  nctId: string,
  indices: number[],
  verdicts: Reverdict[],
): MatchResponse | null {
  if (!prev) return prev;
  const matches = prev.matches.map((m) => {
    if (m.nctId !== nctId) return m;
    const criteria = m.criteria.map((c, i) => {
      const at = indices.indexOf(i);
      if (at === -1 || !verdicts[at]) return c;
      return {
        ...c,
        verdict: verdicts[at].verdict,
        evidence: verdicts[at].evidence || c.evidence,
        // Keep the prior reading when the re-judge didn't supply one, rather
        // than defaulting a newly-failing criterion to "definitively out".
        remediable: verdicts[at].remediable ?? c.remediable,
      };
    });
    return { ...m, criteria, status: deriveStatus(criteria), metCount: metCountOf(criteria), total: criteria.length };
  });
  return { ...prev, matches, counts: recomputeCounts(prev.counts, matches) };
}

/* ---- the coordinator's screening log --------------------------------------
   A plain-text transcription of the result set, grouped the way a coordinator
   triages: who can be approached, who needs a phone call and about what, who is
   out and whether that is reversible. It restates the same disclaimer the screen
   carries, because a pasted artifact outlives the screen it came from.
   -------------------------------------------------------------------------- */
function buildScreeningLog(data: MatchResponse): string {
  const { counts, matches, conditionQuery, summary, coverage } = data;
  const L: string[] = [];
  const terms = (coverage?.terms ?? []).filter((t) => !t.error && t.added > 0);

  const curated = data.provenance === "curated-demo";

  L.push("TRIALIGN SCREENING LOG");
  if (curated) {
    // The same caveat the screen carries. A log gets pasted into notes and
    // emails, where it outlives the screen that qualified it — so it has to
    // qualify itself, or it becomes a screening record of a screen that never ran.
    L.push("CURATED DEMO RESULT for the sample patient — illustrative only.");
    L.push("No registry search and no model reasoning were run to produce this.");
  } else {
    L.push("Informational pre-screen against published registry criteria. NOT an eligibility");
    L.push("determination — only the study team can confirm eligibility, after a screening workup.");
  }
  L.push("");
  if (summary) L.push(`Patient: ${summary}`);
  L.push(
    curated
      ? `Condition: ${conditionQuery} · ${counts.poolTotal} hand-authored example studies`
      : `Search: ${conditionQuery}${terms.length > 1 ? ` (+${terms.length - 1} related terms)` : ""} · ` +
          `${counts.poolTotal} recruiting studies retrieved · top ${counts.reasoned} reasoned in depth`,
  );
  L.push(curated ? "Studies are real ClinicalTrials.gov records; the verdicts below are hand-authored." : "Source: ClinicalTrials.gov");

  const section = (title: string, rows: TrialMatch[], body: (m: TrialMatch) => string[]) => {
    if (rows.length === 0) return;
    L.push("", `${title} (${rows.length})`, "-".repeat(70));
    for (const m of rows) {
      L.push(`${m.nctId}  ${m.title}`);
      L.push(`  ${m.phase} · ${m.sponsor}`);
      for (const line of body(m)) L.push(`  ${line}`);
      L.push("");
    }
  };

  const siteLine = (m: TrialMatch): string => {
    const site = m.factors.nearestSiteActive ? m.factors.nearestSite : `${m.factors.nearestSite} (NO SITE LISTED AS RECRUITING)`;
    const age = m.factors.registryStale && m.factors.registryAgeDays !== null ? ` · registry record ${m.factors.registryAgeDays} days old` : "";
    return `site: ${site}${age}`;
  };

  section("ELIGIBLE ON PUBLISHED CRITERIA", matches.filter((m) => m.status === "eligible"), (m) => [
    siteLine(m),
    `${m.metCount}/${m.total} criteria satisfied, no open items`,
  ]);

  section("NEEDS INFORMATION", matches.filter((m) => m.status === "uncertain"), (m) => [
    siteLine(m),
    `${m.metCount}/${m.total} criteria satisfied · ${openCountOf(m.criteria)} open`,
    "to obtain:",
    ...m.criteria
      .filter((c) => c.verdict === "confirm")
      .map((c) => `  - ${c.requirement}  [${c.provenance === "not_documented" ? "nothing on record" : c.provenance}]`),
  ]);

  section("RULED OUT ON PUBLISHED CRITERIA", matches.filter((m) => m.status === "near"), (m) => [
    ...m.criteria
      .filter((c) => c.verdict === "fails")
      .map((c) => `fails: ${c.requirement}  [${c.remediable ? "could change" : "fixed for this patient"}]${c.evidence ? ` — ${c.evidence}` : ""}`),
  ]);

  section("NOT OPEN — PUBLISHED AGE/SEX CRITERIA", matches.filter((m) => m.status === "excluded"), (m) => [
    m.structuralExclusion ?? "",
  ]);

  const screened = matches.filter((m) => m.status === "screened");
  if (screened.length > 0) {
    L.push("", `RETRIEVED BUT NOT REASONED THIS PASS (${screened.length})`, "-".repeat(70));
    L.push("These matched the condition and recruiting filters. They were not ruled out —");
    L.push("they simply did not get a deep-reasoning slot in this run.");
    for (const m of screened) L.push(`${m.nctId}  ${m.title}`);
  }

  return L.join("\n");
}

/* Keep the header status buckets honest after a criterion flips a trial's status. */
function recomputeCounts(base: Counts, matches: TrialMatch[]): Counts {
  const reasoned = matches.filter((m) => m.status !== "screened" && m.status !== "excluded");
  return {
    ...base,
    eligible: reasoned.filter((m) => m.status === "eligible").length,
    uncertain: reasoned.filter((m) => m.status === "uncertain").length,
    near: reasoned.filter((m) => m.status === "near").length,
  };
}

/* Run fn over items with at most `limit` in flight — polite background concurrency. */
async function runBounded<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

/* ---- "Your next steps": the on-screen handoff for trials the patient is FULLY
   eligible for (status === "eligible"). These have no open items to confirm by
   definition (verdict.ts) — the next step is to act: bring the trial to the care
   team, ask the right questions, and start a referral. Uncertain ("Needs info")
   trials keep their open questions inline on the card; ruled-out trials are moot.
   The panel only opens when there is at least one fully-eligible trial. ---- */
function NextStepsPanel({ matches, onClose, onRefer }: { matches: TrialMatch[]; onClose: () => void; onRefer: (nctId: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trials = matches.filter((m) => m.status === "eligible");
  // §P1 — when there's nothing to act on, say whether there's something to
  // read instead, rather than just going quiet. Uses the same shared splitter
  // Results does, so this count can never disagree with what that section shows.
  const { notYet } = splitNearMisses(matches);

  return (
    <div className="ns-overlay" role="dialog" aria-modal="true" aria-label="Your next steps" onClick={onClose}>
      <div className="ns-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ns-head">
          <div>
            <h2>Your next steps</h2>
            <p className="ns-sub">
              {trials.length > 0
                ? `${trials.length} trial${trials.length > 1 ? "s" : ""} you match on record. Bring ${
                    trials.length > 1 ? "these" : "this"
                  } to your care team to confirm and start a referral — a study team makes the final eligibility call.`
                : notYet.length > 0
                  ? `No fully-eligible trials yet. ${notYet.length} ${notYet.length > 1 ? "studies" : "study"} on the results page list only criteria that could still change — see “Not open to you yet”, above the ruled-out list.`
                  : "No fully-eligible trials yet. Once you match a trial on record, its next steps show up here."}
            </p>
          </div>
          <button className="ns-close" onClick={onClose} aria-label="Close next steps">
            ✕
          </button>
        </div>

        <div className="ns-body">
          {trials.length === 0 && (
            <div className="ns-empty">
              {notYet.length > 0
                ? `Nothing to act on yet. ${notYet.length} ${notYet.length > 1 ? "studies" : "study"} in “Not open to you yet” list what's standing in the way — worth reading with your care team, though the study team still decides.`
                : "Nothing to act on yet — once you fully match a trial on record, its next steps appear here."}
            </div>
          )}
          {trials.map((m) => (
            <section className="ns-trial" key={m.nctId}>
              <div className="ns-trial-h">
                <a className="nct" href={m.url} target="_blank" rel="noopener noreferrer">
                  {m.nctId} ↗
                </a>
                <span className="ns-title">{m.title}</span>
              </div>
              <div className="ns-site">
                <span title="Approximate — matched on city/state">◎ {m.factors.nearestSite}</span>
                {m.factors.enrollmentWindow && <span className="ns-enroll">{m.factors.enrollmentWindow}</span>}
              </div>

              <div className="ns-eligible-note">✓ Matches every criterion we could check from your record. A study team confirms final eligibility.</div>

              {m.brief && m.brief.questionsToAsk.length > 0 && (
                <>
                  <div className="ns-sec-h">Questions to ask your care team</div>
                  <ul className="ns-questions">
                    {m.brief.questionsToAsk.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </>
              )}

              <div className="ns-actions">
                <button className="refer-btn" onClick={() => onRefer(m.nctId)}>
                  Prepare referral →
                </button>
              </div>
            </section>
          ))}
        </div>

        <div className="ns-foot disclaimer">
          Informational decision support to review with your care team — not medical advice, and it does not choose for you. Only a study team can confirm whether you
          qualify.
        </div>
      </div>
    </div>
  );
}
