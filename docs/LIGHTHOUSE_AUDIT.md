# Lighthouse production audit

## Final result

Re-audited on 2026-09-02 against a local `next start` production build with Lighthouse 13.4.1 and headless Chrome after the declarative WebMCP form was added. Two runs scored 94 and 96 for Performance; the repeat run below is recorded. The remaining category scores were identical in both runs.

| Category | Score |
| --- | ---: |
| Performance | 96 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 63 |

| Metric | Result |
| --- | ---: |
| First Contentful Paint | 1.0 s |
| Largest Contentful Paint | 2.4 s |
| Total Blocking Time | 170 ms |
| Cumulative Layout Shift | 0 |
| Console errors | 0 |

The new `/webmcp` competition-evidence page was audited separately on 2026-09-02: Performance 98, Accessibility 100, Best Practices 100, SEO 63, FCP 1.0 s, LCP 2.1 s, TBT 80 ms, CLS 0, and no console errors. Its SEO score has the same intentional no-index boundary described below.

After adding the local care-team discussion-brief generator, the home-page regression run remained Performance 96, Accessibility 100, Best Practices 100, SEO 63, FCP 1.0 s, LCP 2.5 s, TBT 130 ms, CLS 0, and no console errors.

After adding the state-aware WebMCP follow-up tool, payload-free execution status, and journey-eval evidence, a sequential production regression recorded: home Performance 93, Accessibility 100, Best Practices 100, SEO 63, FCP 1.1 s, LCP 2.5 s, TBT 240 ms, CLS 0, and no console errors; `/webmcp` recorded Performance 98, Accessibility 100, Best Practices 100, SEO 63, FCP 0.9 s, LCP 2.3 s, TBT 70 ms, CLS 0, and no console errors. Two earlier parallel development-server runs were discarded because they contended for CPU and were not comparable production evidence.

After adding the version-locked 50-sample cloud-model selection baseline and its responsive evidence cards, the sequential production regression recorded: home Performance 96, Accessibility 100, Best Practices 100, SEO 63, FCP 1.0 s, LCP 2.5 s, TBT 130 ms, CLS 0, and zero console-error audit items; `/webmcp` recorded Performance 98, Accessibility 100, Best Practices 100, SEO 63, FCP 1.0 s, LCP 2.3 s, TBT 80 ms, CLS 0, and zero console-error audit items.

After adding the user-controlled shortlist, responsive comparison, seventh conditional imperative tool, and 55-sample selection artifact, the home production audit recorded Performance 97, Accessibility 100, Best Practices 100, SEO 63, FCP 1.0 s, LCP 2.5 s, TBT 120 ms, CLS 0, and zero console-error audit items. Two sequential `/webmcp` runs recorded Performance 93 then 98, with identical Accessibility 100, Best Practices 100, SEO 63, CLS 0, and zero console-error audit items; TBT varied from 260 ms to 70 ms. Both results are retained as run-to-run variance rather than reporting only the higher score.

After adding the bounded, downloadable WebMCP session capability receipt and its evidence section, a fresh sequential production audit recorded: home Performance 97, Accessibility 100, Best Practices 100, SEO 63, FCP 1.0 s, LCP 2.4 s, TBT 110 ms, CLS 0, and zero console-error audit items; `/webmcp` recorded Performance 98, Accessibility 100, Best Practices 100, SEO 63, FCP 1.0 s, LCP 2.3 s, TBT 100 ms, CLS 0, and zero console-error audit items.

After adding the visible 19-group bilingual registry query bridge and structured WebMCP query provenance, `/trials` recorded Performance 95, Accessibility 100, Best Practices 100, SEO 63, FCP 0.9 s, LCP 2.2 s, TBT 210 ms, CLS 0, and zero console-error audit items while its initial live public-registry search remained enabled. `/webmcp` recorded Performance 99, Accessibility 100, Best Practices 100, SEO 63, FCP 1.0 s, LCP 2.3 s, TBT 60 ms, CLS 0, and zero console-error audit items.

Command shape:

```powershell
npx --yes lighthouse http://localhost:3002 --chrome-path="C:\Program Files\Google\Chrome\Application\chrome.exe" --chrome-flags="--headless --no-sandbox --disable-gpu" --only-categories=performance,accessibility,best-practices,seo --output=json
```

The Chrome launcher produced an `EPERM` while deleting its temporary profile after writing each report. The final JSON report was present and parseable; the cleanup error did not alter the recorded scores.

## Deliberate SEO boundary

The only SEO failure is crawlability. `app/layout.tsx` and `public/robots.txt` intentionally disable indexing because `docs/READINESS.md` classifies this build as an engineering MVP, not a public clinical service. Do not remove that gate merely to raise a competition score. Indexing requires the public-clinical readiness, legal, governance, monitoring, and incident-response gates to be approved first.

## Verification boundary

Lighthouse exercised a real local Chrome renderer and network lifecycle. It does not replace keyboard-only, screen-reader, large-text, landscape, or Chrome Model Context Tool Inspector acceptance. The installed browser-control plugin is missing its required `scripts/browser-client.mjs` runtime, so no claim is made about completed scripted clicks or WebMCP Inspector behavior.
