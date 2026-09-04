"use client";

import { useState, type FormEvent } from "react";
import { publicTrialFormContractCore } from "@/lib/webmcp/toolContractCore";

/** A small, visible declarative tool on the landing page. The full database remains on /trials. */
export function LandingTrialSearch() {
  const [condition, setCondition] = useState("");
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = condition.trim();
    if (value.length < 2) return;
    setStatus("Searching the public index…");
    try {
      const response = await fetch("/api/trials/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condition: value, includeNotOpen: true, pageSize: 5 }),
      });
      const payload = await response.json() as { trials?: unknown[]; error?: string };
      setStatus(response.ok ? `${payload.trials?.length ?? 0} public records found. Open the database for details.` : (payload.error ?? "Search unavailable."));
    } catch {
      setStatus("Search unavailable. Please try the full database page.");
    }
  }

  return (
    <section className="database-shell landing-tool" aria-labelledby="landing-search-title">
      <form id="landing-public-trial-search-form" method="get" toolname={publicTrialFormContractCore.name} tooldescription={publicTrialFormContractCore.description} toollocation="/" toolaction="search-public-trial-records" toolautosubmit="" onSubmit={submit}>
        <div className="search-heading"><div><p className="eyebrow">Agent-ready public search</p><h2 id="landing-search-title">Find public trial records</h2></div><span className="webmcp-form-pill">Declarative WebMCP</span></div>
        <label htmlFor="landing-trial-condition">Cancer type or condition</label>
        <div className="search-row">
          <input id="landing-trial-condition" name="condition" type="search" value={condition} onChange={(event) => setCondition(event.target.value)} minLength={2} maxLength={120} required toolparamdescription={publicTrialFormContractCore.inputSchema.properties.condition.description} placeholder="e.g. breast cancer" />
          <button className="primary-action" type="submit">Search trials</button>
        </div>
        {status && <p className="agent-form-notice" role="status" aria-live="polite">{status}</p>}
      </form>
    </section>
  );
}
