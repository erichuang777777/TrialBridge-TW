"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { NormalizedTrial, RegionTier, TrialDataState } from "@/lib/trials/types";
import type { RegistryQueryPlan } from "@/lib/trials/queryBridge";
import { formatRegistryDuration, registrySourceTimeoutMs } from "@/lib/trials/reliability";
import { createPublicTrialSearchPath, defaultPublicTrialCondition, normalizePublicTrialCondition, normalizeShareablePublicTrialCondition, parsePublicTrialSearchParams } from "@/lib/trials/searchUrl";
import { createBoundedPublicSearchOutput } from "@/lib/webmcp/publicSearchOutput";
import { publicTrialFormContractCore } from "@/lib/webmcp/toolContractCore";

type SearchResponse = {
  trials?: NormalizedTrial[];
  queryPlan?: RegistryQueryPlan;
  sources?: Array<{ registry: string; count: number; retrievedAt: string; durationMs: number; warning?: string; dataState?: TrialDataState }>;
  failures?: Array<{ registry: string; message: string; code: "SOURCE_TIMEOUT" | "SOURCE_UNAVAILABLE"; durationMs: number }>;
  disclaimer?: string;
  error?: string;
};

const suggestions = [
  { condition: "breast cancer", label: "Breast cancer" },
  { condition: "肺癌", label: "肺癌 · Lung cancer" },
  { condition: "胃癌", label: "胃癌 · Gastric cancer" },
  { condition: "colorectal cancer", label: "Colorectal cancer" },
];
const declarativeToolName = publicTrialFormContractCore.name;
const regions: Array<{ value: "all" | RegionTier; label: string }> = [
  { value: "all", label: "All regions" },
  { value: "taiwan", label: "Taiwan" },
  { value: "asia", label: "Asia" },
  { value: "world", label: "Worldwide" },
];

function regionLabel(region: RegionTier) {
  return { taiwan: "Taiwan", asia: "Asia", world: "Worldwide", unknown: "Location unknown" }[region];
}

function sourceStateLabel(source: NonNullable<SearchResponse["sources"]>[number]) {
  if (!source.dataState) return `queried ${new Date(source.retrievedAt).toLocaleDateString("en-CA")}`;
  const date = new Date(source.dataState.loadedAt).toLocaleDateString("en-CA");
  if (source.dataState.storage === "scheduled_file") {
    return source.dataState.mode === "stale_cache"
      ? `scheduled snapshot stale · ${date} · refresh job required`
      : `scheduled snapshot · validated ${date}`;
  }
  if (source.dataState.mode === "fresh_cache") return `fresh cache · snapshot ${date}`;
  if (source.dataState.mode === "stale_cache") return `stale cache · snapshot ${date} · refresh requested`;
  return `live source · loaded ${date}`;
}

export function TrialDatabase() {
  const [query, setQuery] = useState(defaultPublicTrialCondition);
  const [submittedQuery, setSubmittedQuery] = useState(defaultPublicTrialCondition);
  const [includeNotOpen, setIncludeNotOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<"all" | RegionTier>("all");
  const [result, setResult] = useState<SearchResponse>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [urlNotice, setUrlNotice] = useState("");
  const [declarativeNotice, setDeclarativeNotice] = useState("");
  const [declarativeActive, setDeclarativeActive] = useState(false);
  const [searchElapsedSeconds, setSearchElapsedSeconds] = useState(0);
  const initialSearchStarted = useRef(false);

  async function search(condition: string, includeClosed = includeNotOpen, syncUrl = true): Promise<unknown> {
    const normalized = normalizePublicTrialCondition(condition);
    if (!normalized) {
      const message = "Use one general cancer condition without names, contact details, record numbers, or line breaks.";
      setLoading(false);
      setError(message);
      return { error: message };
    }
    setLoading(true);
    setError("");
    setSelectedRegion("all");
    setSubmittedQuery(normalized);
    if (syncUrl) {
      if (normalizeShareablePublicTrialCondition(normalized)) {
        setUrlNotice("");
        window.history.replaceState(window.history.state, "", createPublicTrialSearchPath(normalized, includeClosed));
      } else {
        setUrlNotice("This detailed or unrecognized condition is being searched without storing it in the URL.");
        window.history.replaceState(window.history.state, "", "/trials");
      }
    }
    try {
      const response = await fetch("/api/trials/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condition: normalized, pageSize: 40, includeNotOpen: includeClosed }),
      });
      const payload = await response.json() as SearchResponse;
      setResult(payload);
      const boundedOutput = createBoundedPublicSearchOutput({ query: normalized, queryPlan: payload.queryPlan, trials: payload.trials ?? [], sources: payload.sources, failures: payload.failures, limitation: payload.disclaimer });
      if (!response.ok && (payload.sources?.length ?? 0) === 0) {
        setError(payload.error ?? "No registry responded before its deadline. Please try again.");
      }
      return boundedOutput;
    } catch (searchError) {
      setResult({});
      const message = searchError instanceof Error ? searchError.message : "Search failed. Please try again.";
      setError(message);
      return { error: message, retryable: true };
    } finally {
      setLoading(false);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedCondition = String(formData.get("condition") ?? "");
    const includeClosed = formData.has("includeNotOpen");
    setQuery(submittedCondition);
    setIncludeNotOpen(includeClosed);
    const searchPromise = search(submittedCondition, includeClosed);
    const declarativeEvent = event.nativeEvent as SubmitEvent;
    if (declarativeEvent.agentInvoked && declarativeEvent.respondWith) declarativeEvent.respondWith(searchPromise);
  }

  useEffect(() => {
    if (!loading) return;
    setSearchElapsedSeconds(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => setSearchElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (initialSearchStarted.current) return;
    initialSearchStarted.current = true;
    const urlState = parsePublicTrialSearchParams(window.location.search);
    setQuery(urlState.condition);
    setIncludeNotOpen(urlState.includeNotOpen);
    if (urlState.rejectedCondition) setUrlNotice("The shared search condition was removed because it was not a curated general cancer condition. Enter a broad cancer type without identifiers.");
    if (window.location.search) {
      const safePath = urlState.hasExplicitCondition && !urlState.rejectedCondition ? createPublicTrialSearchPath(urlState.condition, urlState.includeNotOpen) : "/trials";
      window.history.replaceState(window.history.state, "", safePath);
    }
    void search(urlState.condition, urlState.includeNotOpen, false);
  }, []);

  useEffect(() => {
    const activated = (event: ToolActivationEvent) => {
      if (event.toolName === declarativeToolName) {
        setDeclarativeActive(true);
        setDeclarativeNotice("An agent filled this public search. Review the visible condition and results.");
      }
    };
    const cancelled = (event: ToolActivationEvent) => {
      if (event.toolName === declarativeToolName) {
        setDeclarativeActive(false);
        setDeclarativeNotice("");
      }
    };
    window.addEventListener("toolactivated", activated);
    window.addEventListener("toolcanceled", cancelled);
    window.addEventListener("toolcancel", cancelled);
    return () => {
      window.removeEventListener("toolactivated", activated);
      window.removeEventListener("toolcanceled", cancelled);
      window.removeEventListener("toolcancel", cancelled);
    };
  }, []);

  const visibleTrials = useMemo(() => (result.trials ?? []).filter((trial) => selectedRegion === "all" || trial.regionTier === selectedRegion), [result.trials, selectedRegion]);

  return (
    <section className="database-shell" aria-labelledby="database-search-title">
      <form className={`database-search${declarativeActive ? " agent-tool-active" : ""}`} toolname={declarativeToolName} tooldescription={publicTrialFormContractCore.description} toolautosubmit="" onSubmit={submitSearch}>
        <div className="search-heading">
          <div><p className="eyebrow">Direct registry search</p><h2 id="database-search-title">What condition are you looking for?</h2></div>
          <div className="source-stack"><span className="source-pill">TFDA + ClinicalTrials.gov</span><span className="webmcp-form-pill">Declarative WebMCP</span></div>
        </div>
        {declarativeNotice && <p className="agent-form-notice" role="status" aria-atomic="true">{declarativeNotice}</p>}
        {urlNotice && <p className="agent-form-notice" role="status" aria-atomic="true">{urlNotice}</p>}
        <label htmlFor="trial-condition">Cancer type or condition</label>
        <div className="search-row">
          <input id="trial-condition" name="condition" type="search" value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={120} required toolparamdescription={publicTrialFormContractCore.inputSchema.properties.condition.description} />
          <button className="primary-action" disabled={loading || query.trim().length < 2}>{loading ? "Searching…" : "Search trials"}</button>
        </div>
        <div className="suggestion-row" aria-label="Suggested searches">
          {suggestions.map((suggestion) => <button type="button" key={suggestion.condition} onClick={() => { setQuery(suggestion.condition); void search(suggestion.condition); }}>{suggestion.label}</button>)}
        </div>
        <label className="confirm-check"><input name="includeNotOpen" type="checkbox" checked={includeNotOpen} onChange={(event) => setIncludeNotOpen(event.target.checked)} toolparamdescription={publicTrialFormContractCore.inputSchema.properties.includeNotOpen.description} />Include records that are not currently open</label>
        <p className="field-helper">English and Traditional Chinese cancer terms are supported. Use only a general condition here; do not paste medical records or identifying information.</p>
      </form>

      <div className="database-results" aria-busy={loading}>
        {loading && <div className="results-loading" role="status"><div className="progress-track" aria-hidden="true"><span /></div><div className="progress-copy"><strong>Searching public registries in Taiwan-first order…</strong><span aria-hidden="true">Elapsed {searchElapsedSeconds}s</span></div><p>Each registry stops after {registrySourceTimeoutMs / 1_000} seconds. If one source is unavailable, verified results from the other source will still appear.</p></div>}
        {!loading && error && <div className="error-panel" role="alert"><strong>Search stopped</strong><p>{error}</p>{(result.failures?.length ?? 0) > 0 && <ul className="registry-error-sources">{result.failures!.map((failure) => <li key={failure.registry}><strong>{failure.registry}</strong><span>{failure.code === "SOURCE_TIMEOUT" ? "Timed out" : "Unavailable"} · {formatRegistryDuration(failure.durationMs)}</span></li>)}</ul>}<button onClick={() => void search(submittedQuery)}>Try again</button></div>}
        {!loading && !error && <>
          <div className="results-toolbar">
            <div role="status" aria-atomic="true"><p className="eyebrow">Results</p><h2>{visibleTrials.length} records for “{submittedQuery}”</h2></div>
            <div className="region-filters" aria-label="Filter results by region">
              {regions.map((region) => <button key={region.value} className={selectedRegion === region.value ? "selected" : ""} aria-pressed={selectedRegion === region.value} onClick={() => setSelectedRegion(region.value)}>{region.label}</button>)}
            </div>
          </div>

          {result.queryPlan && <section className={`registry-query-plan query-${result.queryPlan.strategy}`} aria-labelledby="registry-query-plan-title">
            <div><div><strong id="registry-query-plan-title">Bilingual registry query bridge</strong><span lang="zh-Hant">跨語言試驗搜尋橋</span></div><b>{result.queryPlan.strategy === "curated_bilingual_cancer_lexicon" ? "Mapped term · 已映射" : "Original term · 原詞搜尋"}</b></div>
            <dl><div><dt>TFDA</dt><dd lang="zh-Hant">{result.queryPlan.registryConditions.TFDA}</dd></div><div><dt>ClinicalTrials.gov</dt><dd lang="en">{result.queryPlan.registryConditions["ClinicalTrials.gov"]}</dd></div></dl>
            <p>{result.queryPlan.limitation} <small>Lexicon {result.queryPlan.dictionaryVersion}{result.queryPlan.canonicalGroup ? ` · ${result.queryPlan.canonicalGroup}` : ""}</small></p>
          </section>}
          {(result.sources?.length ?? 0) > 0 && <div className="registry-receipts">{result.sources!.map((source) => <span className={`receipt-${source.dataState?.mode ?? "live"}`} key={source.registry}><strong>{source.registry}</strong> {source.count}<small>{sourceStateLabel(source)} · {formatRegistryDuration(source.durationMs)}</small></span>)}</div>}
          {(result.failures?.length ?? 0) > 0 && <div className="registry-partial-notice" role="status" aria-atomic="true"><div><strong>Partial registry results</strong><p>Available records are still shown below. Retry later to restore complete source coverage.</p></div><ul>{result.failures!.map((failure) => <li key={failure.registry}><strong>{failure.registry}</strong><span>{failure.code === "SOURCE_TIMEOUT" ? "Timed out" : "Unavailable"} · {formatRegistryDuration(failure.durationMs)}</span><small>{failure.message}</small></li>)}</ul></div>}

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
