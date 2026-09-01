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

Command shape:

```powershell
npx --yes lighthouse http://localhost:3002 --chrome-path="C:\Program Files\Google\Chrome\Application\chrome.exe" --chrome-flags="--headless --no-sandbox --disable-gpu" --only-categories=performance,accessibility,best-practices,seo --output=json
```

The Chrome launcher produced an `EPERM` while deleting its temporary profile after writing each report. The final JSON report was present and parseable; the cleanup error did not alter the recorded scores.

## Deliberate SEO boundary

The only SEO failure is crawlability. `app/layout.tsx` and `public/robots.txt` intentionally disable indexing because `docs/READINESS.md` classifies this build as an engineering MVP, not a public clinical service. Do not remove that gate merely to raise a competition score. Indexing requires the public-clinical readiness, legal, governance, monitoring, and incident-response gates to be approved first.

## Verification boundary

Lighthouse exercised a real local Chrome renderer and network lifecycle. It does not replace keyboard-only, screen-reader, large-text, landscape, or Chrome Model Context Tool Inspector acceptance. The browser-control package could not initialize because its packaged documentation was missing, so no claim is made about completed scripted clicks or WebMCP Inspector behavior.
