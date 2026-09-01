import type { TrialMatch } from "@/lib/matching/engine";
import type { ConfirmedProfile } from "@/lib/profile/schema";
import { TrialMatchCard } from "./TrialMatchCard";

export function TrialResultGroup({ title, description, emptyText, matches, profile, language, view, collapsed = false, onCreateOutreach }: {
  title: string;
  description: string;
  emptyText: string;
  matches: TrialMatch[];
  profile: ConfirmedProfile;
  language: "en" | "zh-Hant";
  view: "cards" | "list";
  collapsed?: boolean;
  onCreateOutreach: (match: TrialMatch) => void;
}) {
  const content = matches.length > 0
    ? <div className={`match-card-grid ${view === "list" ? "list-view" : "card-view"}`}>{matches.map((match) => <TrialMatchCard key={match.trial.canonicalId} match={match} profile={profile} language={language} view={view} onCreateOutreach={() => onCreateOutreach(match)} />)}</div>
    : <p className="result-group-empty">{emptyText}</p>;

  if (collapsed) return <details className="result-group collapsed-result-group">
    <summary><span><strong>{title}</strong><small>{description}</small></span><b>{matches.length}</b></summary>
    {content}
  </details>;

  return <section className="result-group" aria-label={title}>
    <div className="result-group-heading"><div><h4>{title}</h4><p>{description}</p></div><span>{matches.length}</span></div>
    {content}
  </section>;
}
