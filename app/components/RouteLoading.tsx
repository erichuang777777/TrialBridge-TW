import Link from "next/link";
import { BrandMark } from "./BrandMark";

type RouteLoadingStep = {
  label: string;
  detail: string;
};

type RouteLoadingProps = {
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  steps: readonly RouteLoadingStep[];
};

export function RouteLoading({ eyebrow, title, description, status, steps }: RouteLoadingProps) {
  return (
    <main id="main-content" className="route-loading-page" tabIndex={-1} aria-busy="true">
      <header className="route-loading-header">
        <Link className="brand" href="/" aria-label="TrialBridge TW home">
          <BrandMark />
          <span><strong>TrialBridge TW</strong><small>試驗橋</small></span>
        </Link>
        <span>Opening next view</span>
      </header>

      <section className="route-loading-shell" aria-labelledby="route-loading-title">
        <div className="route-loading-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="route-loading-title">{title}</h1>
          <p>{description}</p>
        </div>

        <div className="route-loading-card" role="status" aria-live="polite" aria-atomic="true">
          <div className="route-loading-status">
            <span aria-hidden="true"><i /></span>
            <div><strong>{status}</strong><small>No estimated percentage is shown.</small></div>
          </div>
          <ol>
            {steps.map((step, index) => (
              <li key={step.label}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{step.label}</strong><small>{step.detail}</small></div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
