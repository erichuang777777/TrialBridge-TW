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

After adding the fail-closed public-discovery profile, page-specific canonical/share metadata, manifest, dynamic robots/sitemap routes, and local-font Open Graph/Twitter images, a production build with the explicit synthetic evaluation profile `SITE_URL=https://trialbridge.example` plus `SITE_INDEXING_ENABLED=true` recorded:

| Route | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Console errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 97 | 100 | 100 | 100 | 1.1 s | 2.5 s | 80 ms | 0 | 0 |
| `/webmcp` | 97 | 100 | 100 | 100 | 1.0 s | 2.3 s | 130 ms | 0 | 0 |
| `/trials` | 98 | 100 | 100 | 100 | 0.9 s | 2.0 s | 130 ms | 0 | 0 |

That profile was exercised only to prove deploy-time behavior; `trialbridge.example` is a reserved synthetic origin, not a claim of publication. Runtime inspection confirmed `index, follow`, five sitemap URLs, `/api/` exclusion, and matching canonical/Open Graph origins. The build artifact was then rebuilt in the default fail-closed profile before handoff.

After adding the four-step in-product judge runbook and curated public-search deep links, default fail-closed production audits recorded:

| Route / viewport | Performance | Accessibility | Best Practices | SEO | CLS | Console errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/webmcp` desktop | 100 | 100 | 100 | 66 | 0 | 0 |
| `/webmcp#judge-runbook-title` mobile | 98 | 100 | 100 | 66 | 0 | 0 |
| `/trials?condition=胃癌` desktop | 100 | 100 | 100 | 66 | 0 | 0 |

Final screenshots were inspected at original output size. The first desktop render exposed a global `<nav>` style collision that compressed the runbook heading; the wrapper was changed to a labelled `<section>`, after which four equal-height desktop cards and one-column mobile cards rendered correctly. The trial screenshot visibly contained `胃癌` in the same declarative search field. One initial deep-link audit emitted `NO_NAVSTART` with no valid trace or screenshot; it was discarded and the same live production URL was re-run successfully. SEO remains intentionally below 100 in this table because the handoff artifact is the default `noindex` profile.

After adding the fixed `/?demo=synthetic#private-chat` judge entry, Lighthouse loaded that exact query against a local `next start` build so the initial privacy state—not only the ordinary home page—was exercised. The first client-only implementation produced CLS 0.084; moving the fixed query decision to the server-rendered page reduced it to 0.010. A first 844×390 landscape pass then exposed CLS 0.117 when the WebMCP status changed inside a three-column summary. Aligning that summary's stable two-row breakpoint with the 1000px workflow breakpoint removed the shift, and the reduced-motion rule stopped creating an unintended all-property transition.

| Synthetic demo viewport | Performance | Accessibility | Best Practices | FCP | LCP | TBT | CLS | Console errors | Non-composited animations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lighthouse default mobile | 96 | 100 | 100 | 1.0 s | 2.4 s | 150 ms | 0.010 | 0 | 0 |
| 375×667 | 93 | 100 | 100 | 0.8 s | 2.2 s | 280 ms | 0.010 | 0 | 0 |
| 844×390 landscape | 93 | 100 | 100 | 0.8 s | 2.5 s | 250 ms | 0 | 0 | 0 |

These final three audits connected Lighthouse to an explicitly managed Chrome 152 remote-debugging port and exited zero, avoiding the Windows temporary-profile cleanup error described below. One trace-only `NO_NAVSTART` attempt produced no valid report and was discarded before the successful landscape rerun.

Command shape:

```powershell
npx --yes lighthouse http://localhost:3002 --chrome-path="C:\Program Files\Google\Chrome\Application\chrome.exe" --chrome-flags="--headless --no-sandbox --disable-gpu" --only-categories=performance,accessibility,best-practices,seo --output=json
```

The Chrome launcher produced an `EPERM` while deleting its temporary profile after writing each report. The final JSON report was present and parseable; the cleanup error did not alter the recorded scores.

## Deliberate SEO boundary

The default profile's only SEO failure is crawlability. `app/layout.tsx` and `app/robots.ts` intentionally disable indexing because `docs/READINESS.md` classifies this build as an engineering MVP, not a public clinical service. Do not enable the reviewed discovery profile merely to raise a competition score. Indexing requires the public-clinical readiness, legal, governance, monitoring, and incident-response gates to be approved first, plus an exact non-loopback HTTPS `SITE_URL` and `SITE_INDEXING_ENABLED=true`.

## Verification boundary

Lighthouse exercised a real local Chrome renderer and network lifecycle, including the final synthetic deep link at 375×667 and 844×390 landscape. It does not replace keyboard-only, screen-reader, large-text, or Chrome Model Context Tool Inspector acceptance. The installed browser-control plugin is missing its required `scripts/browser-client.mjs` runtime, so no claim is made about completed scripted clicks or WebMCP Inspector behavior.
