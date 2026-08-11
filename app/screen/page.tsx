"use client";

/* ============================================================================
   Trialign — /screen, cohort screening (§C1 part 2)

   The clinician-facing half of the engine that shipped first in
   app/api/screen/route.ts. A coordinator's actual question is "this study is
   open — who on today's list might fit?" — the arrow pointed the opposite way
   from the patient flow in app/page.tsx (patient → trials). So this is its own
   page, not a mode bolted onto that one: a coordinator arrives with a study
   already open and a list, not a note to describe.

   Zero persistence, same as the rest of the app: everything here is React
   state, gone on refresh. No localStorage, no fs, nothing written anywhere.

   Reuses the app's tokens, buttons, counts pills, and criterion-row primitives
   (.crow family, from app/globals.css) so this reads as the same product as
   the results screen in app/page.tsx, not a second one.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Criterion, MatchStatus } from "@/lib/types";
import { isValidNctId, formatSiteStatus } from "@/lib/ctgov";
import { MAX_COHORT, type PatientResult, type ScreenResponse } from "@/lib/screenTypes";
import { buildCohortCsv } from "@/lib/cohortCsv";
import {
  buildCorrection,
  buildAdjudicatedCase,
  serializeAdjudicatedCase,
  isAdjudicable,
  type CorrectedStatus,
  type CorrectionBasis,
} from "@/lib/feedback";
import DemoGate from "@/app/components/DemoGate";
import { SAMPLE_NCT_ID, SAMPLE_PATIENT_INPUTS, sampleScreenResult } from "@/lib/demoScreen";

type Draft = { key: string; id: string; summary: string };

/* ---- the screening-failure feedback loop (roadmap: "Deferred, and why") ---
   A coordinator's post-hoc correction, held in React state only and never
   sent anywhere — it leaves this page as a downloaded JSON file, the same
   way the cohort CSV already does (downloadCsv below). See lib/feedback.ts
   for the builder, the invariants it enforces, and why the exported file
   satisfies evals/cases/ledger-cases.ts's LedgerCase shape. */
type CorrectionMode = "unset" | "confirm" | "override";
type CorrectionDraft = {
  mode: CorrectionMode;
  /** Only meaningful when mode === "override" — buildCorrection() below
   *  never defaults this from the app's own p.status. */
  trueStatus: CorrectedStatus | "";
  /** "" = nothing chosen · "other" = "not listed by the app" · else the
   *  index (as a string) into this patient's failing criteria. */
  failureChoice: string;
  /** Editable regardless of how failureChoice was set — the coordinator's
   *  own words are what travels, even when they started from the app's. */
  failureText: string;
  /** true iff failureChoice named one of the app's own "fails" criteria. */
  appNamedIt: boolean;
  /** Why the screen and the truth diverged. Decides whether this correction
   *  can become a gold eval case at all — see CorrectionBasis in
   *  lib/feedback.ts. "" until the coordinator answers; the export button
   *  stays disabled while it is unanswered on anything but a plain confirm. */
  basis: CorrectionBasis | "";
  note: string;
  reviewerLabel: string;
};
const EMPTY_DRAFT: CorrectionDraft = {
  mode: "unset",
  trueStatus: "",
  failureChoice: "",
  failureText: "",
  appNamedIt: false,
  basis: "",
  note: "",
  reviewerLabel: "",
};

/** Every MatchStatus bucket a cohort row can carry, with a plain-language
 *  explanation shown regardless of whether the count is 0 for this run — a
 *  bucket the UI stays silent about is exactly the "four zeroes, no
 *  explanation" failure the roadmap calls out (see cohortCounts in
 *  lib/verdict.ts). `cls` is the literal CSS class both the counts pill and
 *  the per-row status badge use. */
const STATUS_META: { key: MatchStatus; cls: string; label: string; blurb: string }[] = [
  { key: "eligible", cls: "eligible", label: "eligible", blurb: "Meets every criterion extracted from the published text." },
  {
    key: "uncertain",
    cls: "uncertain",
    label: "uncertain",
    blurb: "No failures, but at least one criterion needs more information — a coordinator to-do, not a soft no.",
  },
  { key: "near", cls: "near", label: "near / ruled out", blurb: "At least one failing criterion on this patient's record as given." },
  {
    key: "screened",
    cls: "screened",
    label: "not reasoned",
    blurb: "This study publishes no eligibility text to reason over — reached, not evaluated.",
  },
  {
    key: "excluded",
    cls: "excluded",
    label: "excluded",
    blurb: "Ruled out by the study's own published age/sex fields before any model call — no AI judgment involved.",
  },
];

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ScreenPage() {
  const keySeq = useRef(0);
  function nextKey(): string {
    keySeq.current += 1;
    return `p${keySeq.current}`;
  }

  const [nctId, setNctId] = useState("");
  const [rows, setRows] = useState<Draft[]>(() => [{ key: "p0", id: "", summary: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScreenResponse | null>(null);
  // True only when the current `result` came from "Try a sample cohort" — the
  // curated fixture, no /api/screen call. Mirrors MatchResponse.provenance on
  // the patient side (lib/demoMatch.ts) so this screen and its CSV export can
  // never caption a fixture as a live screen, or a live screen as a demo.
  const [isSample, setIsSample] = useState(false);
  // In-memory only, deliberately: a persisted acknowledgement would be a stored
  // record about a person, and the audit's zero-persistence finding is what the
  // privacy page's central claim rests on. Re-asking costs one click.
  const [gate, setGate] = useState(false);
  const [gateAcked, setGateAcked] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [elapsed, setElapsed] = useState(0);
  const [csvSaved, setCsvSaved] = useState(false);
  // Post-screening corrections: keyed by patient id, in memory only. Cleared
  // whenever the roster changes (new screen / new run) — a draft correction
  // for a patient who is no longer on screen is not a thing that should
  // linger. See exportCorrection() below for where a completed one goes.
  const [corrections, setCorrections] = useState<Record<string, CorrectionDraft>>({});
  const [exportedIds, setExportedIds] = useState<Set<string>>(new Set());

  // /api/screen's own maxDuration is 600s (see its header comment) — a real
  // run can take minutes. Show something truer than a static spinner.
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  const filledRows = rows.filter((r) => r.id.trim() || r.summary.trim());
  const overCap = filledRows.length > MAX_COHORT;
  // Mirrors the route's own rejection ("Patient(s) with no summary and no
  // fields") — caught here so the cap and the empty-profile case get a clear
  // message instead of a 400 the coordinator never sees the body of.
  const missingSummary = filledRows.filter((r) => !r.summary.trim());
  const nctTrimmed = nctId.trim();
  const nctValid = nctTrimmed.length > 0 && isValidNctId(nctTrimmed);
  const canRun = nctValid && filledRows.length > 0 && !overCap && missingSummary.length === 0 && !busy;

  function addRow() {
    setRows((rs) => [...rs, { key: nextKey(), id: "", summary: "" }]);
  }
  function removeRow(key: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }
  function editRow(key: string, patch: Partial<Draft>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  // "Try a sample cohort" — the mirror of "Use the sample patient (Margaret)"
  // on the patient side. Unlike Margaret (which still calls /api/extract for
  // real), this has NO extraction step at all: the coordinator's prose goes
  // straight into /api/screen. So the sample can skip the network entirely —
  // it sets the finished matrix directly, client-side, no API key needed for
  // any part of it. Being synthetic by construction, it is also the gate's safe
  // exit rather than something the gate stands in front of.
  function loadSample() {
    setGate(false);
    setError(null);
    setNctId(SAMPLE_NCT_ID);
    setRows(SAMPLE_PATIENT_INPUTS.map((p) => ({ key: nextKey(), id: p.id, summary: p.summary ?? "" })));
    setResult(sampleScreenResult());
    setIsSample(true);
    setExpanded(new Set());
    setCorrections({});
    setExportedIds(new Set());
  }

  function newScreen() {
    setNctId("");
    setRows([{ key: nextKey(), id: "", summary: "" }]);
    setResult(null);
    setError(null);
    setIsSample(false);
    setExpanded(new Set());
    setCorrections({});
    setExportedIds(new Set());
  }

  // Audit finding #1 (BLOCKER), same choke point as the patient side: no
  // entered text may reach the model before the gate is acknowledged. This is
  // a fourth ingest path, and a coordinator's list is 25 notes rather than one
  // — the surface where pasting real records would matter most.
  async function runScreen() {
    if (!canRun) return;
    if (!gateAcked) {
      setGate(true);
      return;
    }
    void doScreen();
  }

  async function doScreen() {
    setBusy(true);
    setError(null);
    setIsSample(false);
    try {
      const res = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nctId: nctTrimmed,
          patients: filledRows.map((r) => ({ id: r.id.trim() || r.key, summary: r.summary })),
          entrant: "clinician",
        }),
      });
      const data = await res.json();
      // Fail truthfully: a non-OK response never becomes an empty matrix that
      // could read as "nobody matched". The error banner stays up until the
      // coordinator retries.
      if (!res.ok) throw new Error(data.error || `Screening failed (HTTP ${res.status}).`);
      setResult(data as ScreenResponse);
      setExpanded(new Set());
      setCorrections({});
      setExportedIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong reaching /api/screen.");
    } finally {
      setBusy(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // In-memory CSV, built client-side and handed to the browser as a Blob URL —
  // never written to disk, never round-tripped through a server. Revoked
  // immediately after the click so nothing lingers.
  function downloadCsv() {
    if (!result) return;
    const csv = buildCohortCsv(result, { curated: isSample });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trialign-cohort-${result.trial.nctId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setCsvSaved(true);
    window.setTimeout(() => setCsvSaved(false), 1600);
  }

  function correctionFor(id: string): CorrectionDraft {
    return corrections[id] ?? EMPTY_DRAFT;
  }

  function patchCorrection(id: string, patch: Partial<CorrectionDraft>) {
    setCorrections((m) => ({ ...m, [id]: { ...correctionFor(id), ...patch } }));
    // Editing after a download means the exported file no longer reflects the
    // draft on screen — the "Saved" badge would otherwise keep claiming a
    // file exists that matches what's now showing.
    setExportedIds((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  // The free-text summary the coordinator actually typed for this patient —
  // the only "profile" the cohort screen ever collects (no structured
  // fields, unlike the patient-facing side). Looked up from the roster
  // rather than re-derived, and from `rows` rather than the request payload,
  // since `rows` is what's still in memory after the run.
  function summaryFor(id: string): string {
    return rows.find((r) => (r.id.trim() || r.key) === id)?.summary ?? "";
  }

  // Turns one patient's correction draft into the downloaded file — the
  // whole round trip this feature exists for: React state → JSON → a file a
  // coordinator can drop into evals/cases/adjudicated/ and have the eval
  // harness actually run. No network call, no write of any kind; the Blob
  // URL is revoked immediately after the click, same discipline as
  // downloadCsv above.
  function exportCorrection(p: PatientResult) {
    if (!result) return;
    const draft = correctionFor(p.id);
    const trueStatus: CorrectedStatus | "" = draft.mode === "confirm" ? (p.status as CorrectedStatus) : draft.trueStatus;
    if (!trueStatus) return; // CorrectionPanel's canExport keeps the button disabled until this is set
    const trueFailure = trueStatus === "near" ? { requirement: draft.failureText.trim(), appNamedIt: draft.appNamedIt } : null;

    let correction;
    try {
      correction = buildCorrection({
        patientId: p.id,
        trialNctId: result.trial.nctId,
        appStatus: p.status,
        trueStatus,
        trueFailure,
        basis: draft.basis === "" ? null : draft.basis,
        note: draft.note,
        reviewerLabel: draft.reviewerLabel,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build that correction.");
      return;
    }

    const adjudicated = buildAdjudicatedCase({
      correction,
      patient: { criteria: p.criteria },
      profile: { summary: summaryFor(p.id) },
      trial: result.trial,
    });
    const json = serializeAdjudicatedCase(adjudicated);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${adjudicated.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setExportedIds((s) => new Set(s).add(p.id));
  }

  return (
    <div className="screen-page">
      {gate && (
        <DemoGate
          onSample={loadSample}
          onContinue={() => {
            setGate(false);
            setGateAcked(true);
            // Replay the action the gate interrupted, so acknowledging costs
            // the coordinator nothing — the same replay the patient side does.
            void doScreen();
          }}
          sampleLabel="Use the sample cohort"
          purpose="to screen your list against this study"
          continueLabel="Continue with synthetic notes"
        />
      )}
      <div className="screen-inner">
        <p className="legal-eyebrow">
          <Link href="/">← Back to Trialign</Link>
        </p>
        <header className="screen-head">
          <div className="demo-badge">DEMO · SYNTHETIC DATA ONLY</div>
          <h1>Cohort screen</h1>
          <p className="screen-lede">
            One study, your list. Enter an NCT id and a cohort of patients — each one gets the same criterion-by-criterion screen as a
            single match, so you can see who on today&apos;s list might fit before you make a call.
          </p>
        </header>

        <section className="screen-panel">
          <h2>Study</h2>
          <p className="sub">The one trial every patient below is screened against.</p>
          <div className="screen-field">
            <label htmlFor="nctId">ClinicalTrials.gov NCT id</label>
            <input
              id="nctId"
              className="screen-nct"
              value={nctId}
              onChange={(e) => setNctId(e.target.value)}
              placeholder="NCT04305496"
              disabled={busy}
            />
            {nctTrimmed.length > 0 && !nctValid && <p className="paste-err">Expected the form NCT followed by 8 digits.</p>}
          </div>
        </section>

        <section className="screen-panel">
          <h2>Patients</h2>
          <p className="sub">
            One row per patient — an id or label (room, MRN, initials) so you can tell rows apart, plus a brief clinical summary. Prose
            is fine; it&apos;s the same free text /api/screen reasons over for a single match.
          </p>
          <div className="cohort-list">
            {rows.map((r) => (
              <div className="cohort-row" key={r.key}>
                <input
                  className="cohort-id"
                  value={r.id}
                  onChange={(e) => editRow(r.key, { id: e.target.value })}
                  placeholder="Patient id / room / MRN"
                  disabled={busy}
                  aria-label="Patient id or label"
                />
                <textarea
                  className="cohort-summary"
                  rows={2}
                  value={r.summary}
                  onChange={(e) => editRow(r.key, { summary: e.target.value })}
                  placeholder="61F, HR+/HER2- metastatic breast cancer, PIK3CA H1047R+, post-CDK4/6…"
                  disabled={busy}
                  aria-label="Patient clinical summary"
                />
                <button
                  type="button"
                  className="cohort-remove"
                  onClick={() => removeRow(r.key)}
                  disabled={busy || rows.length === 1}
                  aria-label="Remove this patient"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="cohort-actions">
            <button type="button" className="chip" onClick={addRow} disabled={busy}>
              + Add patient
            </button>
            <button type="button" className="chip" onClick={loadSample} disabled={busy}>
              <span className="s">demo</span> Try a sample cohort
            </button>
            <span className={`cohort-cap${overCap ? " over" : ""}`}>
              {filledRows.length} / {MAX_COHORT} patients
              {overCap ? ` — over the cap, remove ${filledRows.length - MAX_COHORT}` : ""}
            </span>
          </div>

          {missingSummary.length > 0 && (
            <p className="paste-err">
              {missingSummary.length} patient{missingSummary.length > 1 ? "s" : ""} need a summary before screening:{" "}
              {missingSummary.map((r) => r.id || "(unlabeled)").join(", ")}.
            </p>
          )}

          <div className="screen-run-row">
            <button type="button" className="btn go" onClick={runScreen} disabled={!canRun}>
              {busy ? "Screening…" : "Run screen"}
            </button>
            {result && (
              <button type="button" className="ghost" onClick={newScreen} disabled={busy}>
                New screen
              </button>
            )}
          </div>

          {busy && (
            <div className="screen-progress" role="status" aria-live="polite">
              <span className="sp-dot" aria-hidden />
              Screening {filledRows.length} patient{filledRows.length > 1 ? "s" : ""} against {nctTrimmed}… this can take several
              minutes for a full cohort — elapsed {formatElapsed(elapsed)}. Please keep this tab open.
            </div>
          )}

          {error && (
            <div className="err" role="alert">
              <b>Screening didn&apos;t complete.</b> {error}
            </div>
          )}
        </section>

        {result && (
          <CohortMatrix
            data={result}
            isSample={isSample}
            expanded={expanded}
            onToggle={toggleExpand}
            onDownload={downloadCsv}
            csvSaved={csvSaved}
            getDraft={correctionFor}
            onDraftChange={patchCorrection}
            onExportCorrection={exportCorrection}
            exportedIds={exportedIds}
          />
        )}

        <p className="disclaimer">
          Informational pre-screen against published registry criteria for a coordinator&apos;s review — not medical advice or a final
          eligibility determination. Only the study team can confirm eligibility, after a screening workup.
        </p>
      </div>
    </div>
  );
}

function CohortMatrix({
  data,
  isSample,
  expanded,
  onToggle,
  onDownload,
  csvSaved,
  getDraft,
  onDraftChange,
  onExportCorrection,
  exportedIds,
}: {
  data: ScreenResponse;
  isSample: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onDownload: () => void;
  csvSaved: boolean;
  getDraft: (id: string) => CorrectionDraft;
  onDraftChange: (id: string, patch: Partial<CorrectionDraft>) => void;
  onExportCorrection: (p: PatientResult) => void;
  exportedIds: Set<string>;
}) {
  const { trial, counts, patients } = data;

  return (
    <section className="screen-panel">
      <div className="board-head">
        <h2>
          {trial.nctId} — {trial.title}
        </h2>
        <div className="board-head-r">
          <button type="button" className="nextsteps-btn" onClick={onDownload} title="Download the cohort matrix as a CSV file">
            {csvSaved ? "Saved" : "Download CSV"}
          </button>
        </div>
      </div>
      <p className="board-sub">
        <span className="mono">{trial.phase}</span> · {trial.sponsor} ·{" "}
        <a href={trial.url} target="_blank" rel="noopener noreferrer">
          {trial.nctId} ↗
        </a>
        {/* A coordinator often arrives with an NCT id off an old email. Whether
            the study is still recruiting decides whether screening 25 people
            against it is work or waste, so it belongs next to the id — not
            fetched, normalized, and then dropped. */}
        {trial.overallStatus ? <> · {formatSiteStatus(trial.overallStatus)}</> : null}
        {trial.registryStale && trial.registryAgeDays !== null ? <> · registry record {trial.registryAgeDays} days old</> : null}
      </p>

      <div className="board-notes">
        <span className="bn ai">
          <span className="bn-ic" aria-hidden>
            ⓘ
          </span>{" "}
          {isSample
            ? "Curated demo cohort for illustration — no registry search and no model call ran to produce this."
            : "AI-generated eligibility — not a determination; only the study team can confirm eligibility."}
        </span>
      </div>

      {/* Every bucket the route can return, always rendered — including any
          that are 0 for this run, each with what it means. A count that stops
          reconciling reads as a finding rather than a dropped bucket. */}
      <div className="counts">
        {STATUS_META.map((b) => (
          <span key={b.key} className={`count ${b.cls}`} title={b.blurb}>
            <span className="count-dot" aria-hidden />
            <b>{counts[b.key]}</b> {b.label}
          </span>
        ))}
        <span className="count total" title="Every bucket sums to the total screened.">
          <b>{counts.total}</b> total
        </span>
      </div>
      <div className="matrix-legend">
        {STATUS_META.map((b) => (
          <span key={b.key}>
            <b>{b.label}</b> — {b.blurb}
          </span>
        ))}
      </div>

      <div className="matrix-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Status</th>
              <th>Open items</th>
              <th>Hard fails</th>
              <th>Met / total</th>
              <th>Headline</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <PatientRow
                key={p.id}
                p={p}
                open={expanded.has(p.id)}
                onToggle={() => onToggle(p.id)}
                draft={getDraft(p.id)}
                onDraftChange={(patch) => onDraftChange(p.id, patch)}
                onExport={() => onExportCorrection(p)}
                exported={exportedIds.has(p.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PatientRow({
  p,
  open,
  onToggle,
  draft,
  onDraftChange,
  onExport,
  exported,
}: {
  p: PatientResult;
  open: boolean;
  onToggle: () => void;
  draft: CorrectionDraft;
  onDraftChange: (patch: Partial<CorrectionDraft>) => void;
  onExport: () => void;
  exported: boolean;
}) {
  return (
    <>
      <tr className="matrix-row">
        <td className="matrix-id">{p.id}</td>
        <td>
          <span className={`matrix-status ${p.status}`}>
            <span className="dot" aria-hidden />
            {p.status}
          </span>
        </td>
        <td className="matrix-num">{p.openCount}</td>
        <td className="matrix-num">{p.hardFailCount}</td>
        <td className="matrix-num">{p.total > 0 ? `${p.metCount}/${p.total}` : "—"}</td>
        <td className="matrix-headline">{p.headline || "—"}</td>
        <td>
          {/* Reachable for EVERY patient, not just the interesting ones — the
              ledger is the evidence, per app/api/screen/route.ts's header
              comment ("the ledger is the evidence"). */}
          <button type="button" className="matrix-toggle" aria-expanded={open} onClick={onToggle}>
            {open ? "Hide ledger" : "View ledger"}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="matrix-detail-row">
          <td colSpan={7}>
            <div className="matrix-detail">
              {p.structuralExclusion && (
                <div className="matrix-exclusion">
                  Structurally excluded — {p.structuralExclusion} No model call ran for this patient.
                </div>
              )}
              {p.criteria.length > 0 ? (
                <div className="ledger">
                  {p.criteria.map((c, i) => (
                    <CriterionRow key={i} c={c} />
                  ))}
                </div>
              ) : (
                !p.structuralExclusion && (
                  <p className="matrix-empty-ledger">
                    {p.status === "screened"
                      ? "No criteria to show — this study publishes no eligibility text to reason over."
                      : "No criteria to show."}
                  </p>
                )
              )}
              {/* Post-hoc only: not part of the screening read, and only offered
                  for a row a model actually reasoned over (see isAdjudicable in
                  lib/feedback.ts — "screened" and "excluded" are not clinical
                  judgments, so there is nothing here to confirm or correct). */}
              {isAdjudicable(p.status) && (
                <CorrectionPanel p={p} draft={draft} onChange={onDraftChange} onExport={onExport} exported={exported} />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** What a coordinator learns after the fact — the screening-failure feedback
 *  loop's whole affordance, in one collapsed-by-default block below the
 *  ledger. See lib/feedback.ts for what leaves the browser and why. */
function CorrectionPanel({
  p,
  draft,
  onChange,
  onExport,
  exported,
}: {
  p: PatientResult;
  draft: CorrectionDraft;
  onChange: (patch: Partial<CorrectionDraft>) => void;
  onExport: () => void;
  exported: boolean;
}) {
  const failingCriteria = p.criteria.filter((c) => c.verdict === "fails");
  const trueStatus: CorrectedStatus | "" = draft.mode === "confirm" ? (p.status as CorrectedStatus) : draft.trueStatus;
  const needsFailure = trueStatus === "near";
  // A basis is needed whenever there is a divergence to explain: either the
  // coordinator disagrees with the app's bucket, or they agree with it but say
  // the patient failed on something the app never named. Both change what the
  // correction means for the eval; neither can be guessed on their behalf.
  const disagrees = trueStatus !== "" && trueStatus !== p.status;
  const needsBasis = disagrees || (needsFailure && draft.failureChoice === "other");
  const canExport =
    draft.mode !== "unset" &&
    (draft.mode === "confirm" || draft.trueStatus !== "") &&
    (!needsFailure || (draft.failureChoice !== "" && draft.failureText.trim() !== "")) &&
    (!needsBasis || draft.basis !== "");

  function chooseFailure(choice: string) {
    if (choice === "" || choice === "other") {
      onChange({ failureChoice: choice, failureText: choice === "other" ? draft.failureText : "", appNamedIt: false });
      return;
    }
    const c = failingCriteria[Number(choice)];
    onChange({ failureChoice: choice, failureText: c?.requirement ?? "", appNamedIt: true });
  }

  return (
    <div className="matrix-correction">
      <div className="mc-head">
        <span className="mc-title">Post-screening correction</span>
        <span className="mc-sub">
          Record what you actually learn about {p.id} after this screen — not part of the screen itself, and never sent anywhere.
        </span>
      </div>

      <div className="mc-mode">
        <label className="mc-radio">
          <input
            type="radio"
            name={`mc-mode-${p.id}`}
            checked={draft.mode === "confirm"}
            onChange={() => onChange({ mode: "confirm", trueStatus: "" })}
          />
          Confirms the app — patient was truly <b>{p.status}</b>
        </label>
        <label className="mc-radio">
          <input
            type="radio"
            name={`mc-mode-${p.id}`}
            checked={draft.mode === "override"}
            onChange={() => onChange({ mode: "override" })}
          />
          Different from the app
        </label>
      </div>

      {draft.mode === "override" && (
        <div className="mc-field">
          <label>True status</label>
          <select
            value={draft.trueStatus}
            onChange={(e) => onChange({ trueStatus: e.target.value as CorrectedStatus | "", failureChoice: "", failureText: "" })}
          >
            <option value="">Choose…</option>
            <option value="eligible">eligible</option>
            <option value="uncertain">uncertain</option>
            <option value="near">near / ruled out</option>
          </select>
        </div>
      )}

      {needsFailure && (
        <div className="mc-field">
          <label>Criterion actually failed</label>
          <select value={draft.failureChoice} onChange={(e) => chooseFailure(e.target.value)}>
            <option value="">Choose…</option>
            {failingCriteria.map((c, i) => (
              <option key={i} value={String(i)}>
                {c.requirement}
              </option>
            ))}
            <option value="other">Not listed by the app — describe below</option>
          </select>
          <textarea
            className="mc-failure-text"
            rows={2}
            value={draft.failureText}
            onChange={(e) => onChange({ failureText: e.target.value })}
            placeholder="The criterion, in your own words"
            disabled={draft.failureChoice === ""}
          />
        </div>
      )}

      {needsBasis && (
        <div className="mc-field">
          <label>Why did the screen and the outcome differ?</label>
          <select value={draft.basis} onChange={(e) => onChange({ basis: e.target.value as CorrectionBasis | "" })}>
            <option value="">Choose one…</option>
            <option value="published-criteria">The information was in the record and the published criteria — this was read wrong</option>
            <option value="criterion-missing">The criterion is in the study&apos;s published text, but never appeared in this ledger</option>
            <option value="outside-the-record">The deciding fact wasn&apos;t in the record we screened (a later scan, an undocumented history)</option>
          </select>
          {/* Said plainly, because the coordinator is the one choosing, and the
              third answer means something different from the first two. */}
          <p className="mc-hint">
            {draft.basis === "outside-the-record"
              ? "Kept as feedback about the record, and deliberately not scored against the model — nothing in the notes we screened could have shown this."
              : draft.basis === ""
                ? "This decides whether the correction can be used to score the model at all."
                : "This becomes a scored case: the same notes, the same published criteria, a better answer expected."}
          </p>
        </div>
      )}

      <div className="mc-field">
        <label>Note (optional)</label>
        <textarea
          rows={2}
          value={draft.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="What the record didn't show…"
        />
      </div>

      <div className="mc-field mc-field-inline">
        <label>Reviewer</label>
        <input
          value={draft.reviewerLabel}
          onChange={(e) => onChange({ reviewerLabel: e.target.value })}
          placeholder="Initials or role"
        />
      </div>

      <div className="mc-actions">
        <button type="button" className="mc-export" disabled={!canExport} onClick={onExport}>
          {exported ? "Saved" : "Export correction (JSON)"}
        </button>
        <span className="mc-warning">
          Downloads a file carrying this patient&apos;s summary and outcome — a health-data record. Handle and store it like any other
          PHI.
        </span>
      </div>
    </div>
  );
}

/** Read-only ledger row — no confirm/resolve affordance. This is a coordinator
 *  screening a list, not a patient working through their own open items (that
 *  interactive flow is app/page.tsx's LedgerRow, over /api/reconfirm). Gloss is
 *  omitted for the same reason app/page.tsx suppresses it for entrant ===
 *  "clinician": this reader doesn't need "measurable disease means…" spelled
 *  out, and the criteria carry it anyway since /api/screen defaults the
 *  addressee to the clinician voice. */
function CriterionRow({ c }: { c: Criterion }) {
  const cls = c.verdict === "fails" ? "fails" : c.verdict === "confirm" ? "unc" : "meets";
  const glyph = c.verdict === "fails" ? "✕" : c.verdict === "confirm" ? "?" : "✓";
  return (
    <div className={`crow ${cls}`}>
      <span className="cd">{glyph}</span>
      <span className={`ck ${c.kind}`}>{c.kind}</span>
      <span className="cx">
        {c.requirement}
        {c.verdict === "fails" && (
          <span className={`cfix ${c.remediable ? "soft" : "hard"}`}>{c.remediable ? "could change" : "fixed for this patient"}</span>
        )}
        {c.evidence ? <span className="ev">{c.evidence}</span> : null}
      </span>
      <span className="verdict">{c.verdict}</span>
    </div>
  );
}
