"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedTrial, RegionTier } from "@/lib/trials/types";

type SearchResponse = {
  trials?: NormalizedTrial[];
  sources?: Array<{ registry: string; count: number; retrievedAt: string; warning?: string }>;
  failures?: Array<{ registry: string; message: string }>;
  disclaimer?: string;
  error?: string;
};

const suggestions = ["breast cancer", "lung cancer", "gastric cancer", "colorectal cancer"];
const regions: Array<{ value: "all" | RegionTier; label: string }> = [
  { value: "all", label: "All regions" },
  { value: "taiwan", label: "Taiwan" },
  { value: "asia", label: "Asia" },
  { value: "world", label: "Worldwide" },
];

function regionLabel(region: RegionTier) {
  return { taiwan: "Taiwan", asia: "Asia", world: "Worldwide", unknown: "Location unknown" }[region];
}

export function TrialDatabase() {
  const [query, setQuery] = useState("breast cancer");
  const [submittedQuery, setSubmittedQuery] = useState("breast cancer");
  const [includeNotOpen, setIncludeNotOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<"all" | RegionTier>("all");
  const [result, setResult] = useState<SearchResponse>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const initialSearchStarted = useRef(false);

  async function search(condition: string, includeClosed = includeNotOpen) {
    const normalized = condition.trim();
    if (normalized.length < 2) return;
    setLoading(true);
    setError("");
    setSelectedRegion("all");
    setSubmittedQuery(normalized);
    try {
      const response = await fetch("/api/trials/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condition: normalized, pageSize: 40, includeNotOpen: includeClosed }),
      });
      const payload = await response.json() as SearchResponse;
      if (!response.ok && !payload.trials) throw new Error(payload.error ?? "Trial registries are temporarily unavailable.");
      setResult(payload);
    } catch (searchError) {
      setResult({});
      setError(searchError instanceof Error ? searchError.message : "Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialSearchStarted.current) return;
    initialSearchStarted.current = true;
    void search("breast cancer", false);
  }, []);

  const visibleTrials = useMemo(() => (result.trials ?? []).filter((trial) => selectedRegion === "all" || trial.regionTier === selectedRegion), [result.trials, selectedRegion]);

  return (
    <section className="database-shell" aria-labelledby="database-search-title">
      <form className="database-search" onSubmit={(event) => { event.preventDefault(); void search(query); }}>
        <div className="search-heading">
          <div><p className="eyebrow">Direct registry search</p><h2 id="database-search-title">What condition are you looking for?</h2></div>
          <span className="source-pill">TFDA + ClinicalTrials.gov</span>
        </div>
        <label htmlFor="trial-condition">Cancer type or condition</label>
        <div className="search-row">
          <input id="trial-condition" type="search" value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={120} required />
          <button className="primary-action" disabled={loading || query.trim().length < 2}>{loading ? "Searching…" : "Search trials"}</button>
        </div>
        <div className="suggestion-row" aria-label="Suggested searches">
          {suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => { setQuery(suggestion); void search(suggestion); }}>{suggestion}</button>)}
        </div>
        <label className="confirm-check"><input type="checkbox" checked={includeNotOpen} onChange={(event) => setIncludeNotOpen(event.target.checked)} />Include records that are not currently open</label>
        <p className="field-helper">Use only a general condition here. Do not paste medical records or identifying information.</p>
      </form>

      <div className="database-results" aria-live="polite" aria-busy={loading}>
        {loading && <div className="results-loading" role="status"><div className="progress-track" aria-hidden="true"><span /></div><p>Searching public registries in Taiwan-first order…</p></div>}
        {!loading && error && <div className="error-panel" role="alert"><strong>Search stopped</strong><p>{error}</p><button onClick={() => void search(submittedQuery)}>Try again</button></div>}
        {!loading && !error && <>
          <div className="results-toolbar">
            <div><p className="eyebrow">Results</p><h2>{visibleTrials.length} records for “{submittedQuery}”</h2></div>
            <div className="region-filters" aria-label="Filter results by region">
              {regions.map((region) => <button key={region.value} className={selectedRegion === region.value ? "selected" : ""} aria-pressed={selectedRegion === region.value} onClick={() => setSelectedRegion(region.value)}>{region.label}</button>)}
            </div>
          </div>

          {(result.sources?.length ?? 0) > 0 && <div className="registry-receipts">{result.sources!.map((source) => <span key={source.registry}><strong>{source.registry}</strong> {source.count} · retrieved {new Date(source.retrievedAt).toLocaleDateString("en-CA")}</span>)}</div>}
          {(result.failures?.length ?? 0) > 0 && <div className="notice">Some sources were unavailable: {result.failures!.map((failure) => `${failure.registry} — ${failure.message}`).join("; ")}</div>}

          {visibleTrials.length === 0 ? <div className="empty-results"><h3>No records in this view</h3><p>Try another cancer term, include closed records, or switch to All regions.</p></div> : <div className="trial-grid">{visibleTrials.map((trial) => <article className="trial-card" key={trial.canonicalId}>
            <div className="trial-card-top"><span className="region-badge">{regionLabel(trial.regionTier)}</span><span className={`recruitment-badge recruitment-${trial.recruitment.category}`}>{trial.recruitment.acceptingNewParticipants ? "Accepting participants" : trial.recruitment.raw}</span></div>
            <h3>{trial.title}</h3>
            <p className="trial-meta">{trial.phases.join(" · ") || "Phase not stated"} · {trial.conditions.slice(0, 3).join(" · ") || "Condition not stated"}</p>
            {trial.locations.length > 0 && <p><strong>Locations:</strong> {trial.locations.slice(0, 3).map((location) => [location.city, location.country].filter(Boolean).join(", ")).join(" · ")}{trial.locations.length > 3 ? ` +${trial.locations.length - 3}` : ""}</p>}
            <details><summary>View registry details</summary>{trial.summary && <p>{trial.summary}</p>}{trial.interventions.length > 0 && <p><strong>Interventions:</strong> {trial.interventions.join(", ")}</p>}<p><strong>Eligibility:</strong> {[trial.eligibility.minimumAge, trial.eligibility.maximumAge, trial.eligibility.sex].filter(Boolean).join(" · ") || "See source registry"}</p></details>
            <div className="trial-sources">{trial.sources.map((source) => <a key={`${source.registry}:${source.registryId}`} href={source.url} target="_blank" rel="noreferrer">{source.registry}: {source.registryId}</a>)}</div>
          </article>)}</div>}
          <p className="database-disclaimer">{result.disclaimer}</p>
        </>}
      </div>
    </section>
  );
}
