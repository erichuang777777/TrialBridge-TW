import Link from "next/link";
import type { Metadata } from "next";
import type { Trial } from "@/lib/types";
import { fetchWeeklyBreastCancerDigest, type WeeklyDigest } from "@/lib/trialWatch";

export const metadata: Metadata = {
  title: "Breast cancer trial watch · Trialign",
  description:
    "What changed on ClinicalTrials.gov this week for breast cancer — newly recruiting studies, early closures, and completions.",
};

// Always live — this is a "what changed" digest, a cached page would defeat the point.
export const dynamic = "force-dynamic";

/* ============================================================================
   /watch — weekly breast-cancer trial digest (WO42633 follow-up)

   Standalone page, no patient data: a public read of what ClinicalTrials.gov
   changed this week for breast cancer generally. Pairs with the weekly
   automation that reports this same digest directly; this page is the
   always-current, load-anytime view of it.
   ========================================================================== */

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
      <h2>
        {title} <span className="watch-count">{trials.length}</span>
      </h2>
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

export default async function WatchPage() {
  let digest: WeeklyDigest | null = null;
  let error: string | null = null;
  try {
    digest = await fetchWeeklyBreastCancerDigest(7);
  } catch (err) {
    error = err instanceof Error ? err.message : "ClinicalTrials.gov request failed.";
  }

  return (
    <div className="legal">
      <div className="legal-inner">
        <p className="legal-eyebrow">
          <Link href="/">← Back to Trialign</Link>
        </p>

        <header className="legal-head">
          <h1>Breast cancer trial watch</h1>
          <p className="legal-lede">
            Everything ClinicalTrials.gov changed in the last 7 days for breast cancer studies — newly recruiting trials, trials
            that closed before their planned end, and trials that completed. Pulled live on every visit; nothing here is
            patient-specific.
          </p>
          {digest && (
            <p className="legal-meta">
              Window: {fmtDate(digest.sinceDate)} – {fmtDate(digest.generatedAt)} · {digest.totalUpdated} studies touched · Source:{" "}
              <a href="https://clinicaltrials.gov/search?cond=breast%20cancer" target="_blank" rel="noopener">
                ClinicalTrials.gov
              </a>
            </p>
          )}
        </header>

        {error ? (
          <div className="err">Couldn&apos;t reach ClinicalTrials.gov: {error}. Try reloading in a moment.</div>
        ) : digest ? (
          <>
            <Section
              title="Newly recruiting"
              hint="Open to enrollment as of this week."
              trials={digest.recruiting}
              badge="eligible"
              badgeLabel="recruiting"
              emptyText="No breast-cancer studies moved to Recruiting this week."
            />
            <Section
              title="Closed early"
              hint="Terminated, withdrawn, or suspended before their planned end — worth a look at why."
              trials={digest.closedEarly}
              badge="near"
              badgeLabel="closed early"
              emptyText="No breast-cancer studies closed early this week."
            />
            <Section
              title="Completed"
              hint="Ran to their planned end this week."
              trials={digest.completed}
              badge="screened"
              badgeLabel="completed"
              emptyText="No breast-cancer studies completed this week."
            />
            {digest.other.length > 0 && (
              <details className="legal-sec">
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                  Other status changes <span className="watch-count">{digest.other.length}</span>
                </summary>
                <div className="watch-list" style={{ marginTop: 14 }}>
                  {digest.other.map((t) => (
                    <TrialRow key={t.nctId} trial={t} badge="screened" badgeLabel={t.overallStatus.replace(/_/g, " ").toLowerCase()} />
                  ))}
                </div>
              </details>
            )}
          </>
        ) : null}

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
