import Link from "next/link";
import type { Metadata } from "next";
import type { Trial } from "@/lib/types";
import { fetchWeeklyDigests, type WeeklyDigest } from "@/lib/trialWatch";

export const metadata: Metadata = {
  title: "Clinician trial watch · Trialign",
  description:
    "Tracked-cancer studies ClinicalTrials.gov touched this week, grouped by current status — recruiting, closed early, completed.",
};

// Always live — this is a "what changed" digest, a cached page would defeat the point.
export const dynamic = "force-dynamic";

/* ============================================================================
   /watch — weekly clinician trial digest (WO42633 follow-up)

   Standalone page, no patient data: a public read of studies ClinicalTrials.gov
   touched this week for each cancer in lib/trialWatch.ts's TRACKED_CONDITIONS,
   by current status (see that file for why that's not the same as "changed
   status this week"). Pairs with the weekly automation that reports this same
   digest directly; this page is the always-current, load-anytime view of it.
   ========================================================================== */

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function TrialRow({ trial, badge, badgeLabel }: { trial: Trial; badge: "eligible" | "near" | "screened"; badgeLabel: string }) {
  return (
    <div className="dcard watch-row">
      <div className="watch-row__head">
        <span className={`vbadge ${badge}`}>{badgeLabel}</span>
        <a href={trial.url} target="_blank" rel="noopener" className="watch-row__nct">
          {trial.nctId}
        </a>
      </div>
      <p className="watch-row__title">{trial.title}</p>
      <p className="watch-row__meta">
        {trial.phase || "N/A"} · {trial.sponsor} · updated {fmtDate(trial.lastUpdatePostDate)}
      </p>
      {trial.whyStopped && <p className="watch-row__why">Why stopped: {trial.whyStopped}</p>}
    </div>
  );
}

function Section({
  title,
  hint,
  trials,
  badge,
  badgeLabel,
  emptyText,
}: {
  title: string;
  hint: string;
  trials: Trial[];
  badge: "eligible" | "near" | "screened";
  badgeLabel: string;
  emptyText: string;
}) {
  return (
    <section className="legal-sec">
      <h3>
        {title} <span className="watch-count">{trials.length}</span>
      </h3>
      <p className="legal-lede" style={{ marginBottom: 14 }}>
        {hint}
      </p>
      {trials.length === 0 ? (
        <p className="watch-empty">{emptyText}</p>
      ) : (
        <div className="watch-list">
          {trials.map((t) => (
            <TrialRow key={t.nctId} trial={t} badge={badge} badgeLabel={badgeLabel} />
          ))}
        </div>
      )}
    </section>
  );
}

function ConditionBlock({ digest }: { digest: WeeklyDigest }) {
  const label = titleCase(digest.condition);
  return (
    <div className="watch-condition">
      <h2 className="watch-condition__h2">
        {label} <span className="watch-count">{digest.totalUpdated} touched</span>
      </h2>
      <Section
        title="Currently recruiting"
        hint="Open to enrollment, with a registry update this week — may have been recruiting for a while."
        trials={digest.recruiting}
        badge="eligible"
        badgeLabel="recruiting"
        emptyText={`No currently-recruiting ${digest.condition} studies had a registry update this week.`}
      />
      <Section
        title="Closed early"
        hint="Currently terminated, withdrawn, or suspended, with a registry update this week — worth a look at why; the closure itself may predate this week."
        trials={digest.closedEarly}
        badge="near"
        badgeLabel="closed early"
        emptyText={`No terminated, withdrawn, or suspended ${digest.condition} studies had a registry update this week.`}
      />
      <Section
        title="Completed"
        hint="Currently marked completed, with a registry update this week — the completion itself may predate this week."
        trials={digest.completed}
        badge="screened"
        badgeLabel="completed"
        emptyText={`No completed ${digest.condition} studies had a registry update this week.`}
      />
      {digest.other.length > 0 && (
        <details className="legal-sec">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            Other statuses <span className="watch-count">{digest.other.length}</span>
          </summary>
          <div className="watch-list" style={{ marginTop: 14 }}>
            {digest.other.map((t) => (
              <TrialRow key={t.nctId} trial={t} badge="screened" badgeLabel={t.overallStatus.replace(/_/g, " ").toLowerCase()} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default async function WatchPage() {
  let digests: WeeklyDigest[] | null = null;
  let error: string | null = null;
  try {
    digests = await fetchWeeklyDigests(7);
  } catch (err) {
    error = err instanceof Error ? err.message : "ClinicalTrials.gov request failed.";
  }

  const totalTouched = digests?.reduce((sum, d) => sum + d.totalUpdated, 0) ?? 0;
  const window = digests?.[0];

  return (
    <div className="legal">
      <div className="legal-inner">
        <p className="legal-eyebrow">
          <Link href="/">← Back to Trialign</Link>
        </p>

        <header className="legal-head">
          <h1>Clinician trial watch</h1>
          <p className="legal-lede">
            Studies whose ClinicalTrials.gov record was touched in the last 7 days, for the cancers tracked below, grouped by
            their current status — recruiting, closed before their planned end, or completed. The registry gives a current
            status and an update date, not a change history, so a study here may have held that status for a while and just
            had something else edited — this is a status snapshot, not a confirmed transition. Pulled live on every visit;
            nothing here is patient-specific.
          </p>
          {window && (
            <p className="legal-meta">
              Window: {fmtDate(window.sinceDate)} – {fmtDate(window.generatedAt)} · {totalTouched} studies touched across{" "}
              {digests?.length} tracked cancers · Source:{" "}
              <a href="https://clinicaltrials.gov/search" target="_blank" rel="noopener">
                ClinicalTrials.gov
              </a>
            </p>
          )}
        </header>

        {error ? (
          <div className="err">Couldn&apos;t reach ClinicalTrials.gov: {error}. Try reloading in a moment.</div>
        ) : (
          digests?.map((d) => <ConditionBlock key={d.condition} digest={d} />)
        )}

        <p className="legal-meta" style={{ marginTop: 8 }}>
          Informational only — not medical advice. Registry data can lag a sponsor&apos;s actual decision by days to weeks.
        </p>

        <p className="legal-foot">
          <Link href="/">← Back to Trialign</Link>
        </p>
      </div>
    </div>
  );
}
