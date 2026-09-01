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

After adding explicit `live`, `fresh cache`, and bounded `stale cache` registry receipts with the true snapshot load time, a production audit of `/trials?condition=胃癌` recorded Performance 98, Accessibility 100, Best Practices 100, FCP 0.9 s, LCP 2.2 s, TBT 120 ms, CLS 0, zero console errors, and zero non-composited-animation findings. The audit connected to the same explicitly managed Chrome 152 remote-debugging boundary and exited zero.

After adding the dated standards-alignment profile and upstream-draft/current-Chrome execution compatibility, a production audit of `/webmcp` at an explicit 375×812 CSS viewport recorded Performance 98, Accessibility 100, Best Practices 100, FCP 1.1 s, LCP 2.3 s, TBT 110 ms, CLS 0, and zero console errors. The report and final Lighthouse screenshot were parseable; Chrome launcher again reported only its known Windows temporary-profile cleanup `EPERM` after writing the artifacts.

After adding the five-stage critical-user-journey map and download-only browser diagnostic receipt, three sequential audits ran against a separate local `next start` production server on port 3011. The receipt control remained disabled only during the finite browser check and used one atomic completion status after download.

| `/webmcp` viewport | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Console errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lighthouse default mobile | 98 | 100 | 100 | 66 | 1.0 s | 2.3 s | 90 ms | 0 | 0 |
| Explicit 375×812 | 95 | 100 | 100 | 66 | 1.1 s | 2.3 s | 180 ms | 0 | 0 |
| Desktop | 100 | 100 | 100 | 66 | 0.3 s | 0.5 s | 0 ms | 0 | 0 |

The explicit 375px final screenshot was parseable and showed the responsive single-column evidence summary without horizontal clipping. SEO remains intentionally fail-closed. Chrome launcher again emitted its known temporary-profile cleanup `EPERM` only after each JSON report and final screenshot had been written and parsed.

After adding the explicit, body-free `gpt-oss:120b-cloud` smoke test, `/webmcp` was rebuilt and audited on a separate production server. The optional probe is not run by Lighthouse; the audit covers its initial no-request state, stable reserved layout, cancel/retry controls, and diagnostic-receipt copy. The 375×812 and desktop URLs used `#cloud-probe-title` so the final screenshots captured the new component rather than only the page hero.

| `/webmcp` viewport | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Console errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lighthouse default mobile | 99 | 100 | 100 | 66 | 1.1 s | 2.0 s | 100 ms | 0 | 0 |
| Explicit 375×812, first run | 89 | 100 | 100 | 66 | 0.8 s | 2.3 s | 370 ms | 0 | 0 |
| Explicit 375×812, repeat | 93 | 100 | 100 | 66 | 1.1 s | 2.4 s | 260 ms | 0 | 0 |
| 844×390 landscape | 97 | 100 | 100 | 66 | 1.1 s | 2.3 s | 110 ms | 0 | 0 |
| Desktop | 100 | 100 | 100 | 66 | 0.3 s | 0.5 s | 0 ms | 0 | 0 |

Both 375px runs are retained as observed run-to-run variance. The original-size 375px, landscape, and desktop screenshots were visually inspected: the probe description, optional state, single primary action, finite-limit copy, and receipt download stack into one column on narrow screens without clipping; landscape and desktop retain the compact horizontal action row. The Windows Chrome launcher again reported only the known post-artifact temporary-profile cleanup `EPERM`; every JSON report and inspected screenshot was already present and parseable.

After propagating imperative WebMCP cancellation to the registry adapters and adding the source-reported implementation landscape, `/webmcp#implementation-evidence-title` was rebuilt and audited on an isolated production server. The first screenshot review found the longer Brave status wrapping at 844px and lowering its card title. The status row now reserves equal height in multi-column layouts and releases it in the single-column mobile layout; the final 375px and 844×390 screenshots confirm aligned titles, readable links, and no horizontal clipping.

| `/webmcp` viewport | Performance | Accessibility | Best Practices | FCP | LCP | TBT | CLS | Console errors | Non-composited animations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lighthouse default mobile | 98 | 100 | 100 | 1.1 s | 2.2 s | 120 ms | 0 | 0 | 0 |
| Explicit 375×812 | 97 | 100 | 100 | 1.1 s | 2.3 s | 110 ms | 0 | 0 | 0 |
| 844×390 landscape | 97 | 100 | 100 | 1.1 s | 2.3 s | 120 ms | 0 | 0 | 0 |
| Desktop | 100 | 100 | 100 | 0.3 s | 0.5 s | 0 ms | 0 | 0 | 0 |

All accepted reports used an explicitly managed headless Chrome debugging session. Two desktop trace attempts on one reused Chrome session returned `NO_NAVSTART` and were discarded because they contained no navigation metrics; the successful desktop audit used a fresh managed Chrome session and exited with a complete report. The user development server on port 3001 remained available throughout.

After adding the nine-row judge conformance matrix and static `/webmcp/evidence.json` bundle, production Lighthouse exercised the canonical page and fragment-targeted visual state separately. The canonical 375×812 and 844×390 runs measure ordinary page entry; default-mobile and desktop fragment runs ensure the evidence section is captured. All four accepted reports had Accessibility 100, Best Practices 100, CLS 0, zero console errors, and zero non-composited-animation findings.

| `/webmcp` run | Performance | Accessibility | Best Practices | FCP | LCP | TBT | CLS | Console errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Default mobile, evidence fragment | 96 | 100 | 100 | 1.4 s | 2.5 s | 140 ms | 0 | 0 |
| Canonical explicit 375×812 | 91 | 100 | 100 | 1.1 s | 2.5 s | 290 ms | 0 | 0 |
| Canonical 844×390 landscape | 96 | 100 | 100 | 1.2 s | 2.5 s | 130 ms | 0 | 0 |
| Desktop, evidence fragment | 100 | 100 | 100 | 0.3 s | 0.5 s | 0 ms | 0 | 0 |

Two fragment-targeted visual runs are also retained rather than hidden: explicit 375×812 scored 89 with TBT 350 ms, and 844×390 scored 88 with TBT 380 ms. Main-thread comparison showed lower total style/layout work than the preceding build, so these slower scores reflect long-task distribution while scrolling directly to the deeper fragment rather than an increase in total main-thread work. Their original-size screenshots were visually inspected: status counts stack on mobile, evidence rows become a readable single column, multi-column titles and paths align at 844px and desktop, long paths wrap, and no horizontal clipping is present. The static JSON response was separately verified at 6,629 bytes with `application/json`, nine conformance items, `containsHealthInformation: false`, and `readsMedicalWorkflowState: false`.

After adding the volatile cloud-extraction receipt and explicit failure recovery metadata, the production home-page regression recorded Performance 97, Accessibility 100, Best Practices 100, FCP 1.0 s, LCP 2.5 s, TBT 110 ms, CLS 0, and zero console errors. The fixed synthetic extraction was also exercised through the live localhost proxy: the route returned `gpt-oss:120b-cloud`, provider-reported `gpt-oss:120b`, 6,577 ms server latency, 11 draft facts, `trialBridgePersisted: false`, and `providerRetention: not_assessed`. Original-size development-stage screenshots at 1440×1000 and 375×812 showed the receipt as four compact columns and one mobile column respectively, with no horizontal overflow; those synthetic shortcuts are development-only and do not replace the protected competition flow.

After adding the body-free competition preflight, Lighthouse targeted `/webmcp#competition-preflight-title` on a separate production server and recorded Performance 97, Accessibility 100, Best Practices 100, FCP 1.3 s, LCP 2.4 s, TBT 120 ms, CLS 0, and zero console errors. The audit covered the no-request initial state; it did not spend a provider allowance. The live action was exercised separately and returned overall ready in 5,528 ms with source-level metadata only. Original-size ready-state screenshots at 1440×1000 and 375×812 showed three aligned dependency cards becoming one mobile column, one contextual status announcement, full-width mobile retry, and no horizontal overflow. A production request containing `{}` was independently rejected as `PREFLIGHT_INPUT_FORBIDDEN` before consuming the shared cloud allowance.

After adding the six-check manual Inspector acceptance kit and offline receipt verifier, Lighthouse 13.4.1 targeted `/webmcp#inspector-kit-title` at an explicit 375×812 viewport on an isolated `next start` server. The accepted production report recorded Performance 96, Accessibility 100, Best Practices 100, FCP 1.3 s, LCP 2.5 s, TBT 130 ms, CLS 0, zero console errors, and zero non-composited-animation findings. The original-size screenshot was inspected: the heading, 0/6 score, setup boundary, and disclosure-row headers align in one column without horizontal clipping. An initial development-server run scored 79 with 800 ms TBT and was not used as production evidence. Chrome again wrote a complete report before its known temporary-profile cleanup `EPERM`. The temporary port 3011 process was stopped by its exact owning PID; the user development server on port 3001 remained HTTP 200.

After adding the canonical eight-tool Contract Explorer and static `/webmcp/contracts.json` artifact, Lighthouse 13.4.1 targeted `/webmcp#tool-contract-title` on an isolated production server. The 375×812 audit recorded Performance 97, Accessibility 100, Best Practices 100, FCP 1.4 s, LCP 2.4 s, TBT 130 ms, CLS 0, zero console errors, and zero non-composited-animation findings. The 844×390 landscape audit recorded Performance 96, Accessibility 100, Best Practices 100, FCP 1.4 s, LCP 2.6 s, TBT 110 ms, CLS 0, and the same zero-error findings. The 1440×1000 desktop audit recorded Performance 100, Accessibility 100, Best Practices 100, FCP 0.4 s, LCP 0.6 s, TBT 0 ms, CLS 0, and the same zero-error findings. SEO remained 66 under the intentional no-index profile. Original-size screenshots were inspected: the mobile score, four summary metrics, labelled search, and wrapping availability filters fit without horizontal clipping; landscape keeps all four filters and metrics readable without collision; desktop disclosure rows align kind, tool name, availability, and expand affordance while long tool names remain readable. All Lighthouse runs wrote complete JSON and screenshot artifacts before the known Windows temporary-profile cleanup `EPERM`. The static JSON was separately verified as eight contracts, eight within guidance, zero write authority, and no health-information or workflow-state access.

After adding the four-state Capability State Simulator, Lighthouse targeted `/webmcp#capability-state-title` on the rebuilt isolated production server. The final 375×812 audit recorded Performance 95, Accessibility 100, Best Practices 100, FCP 1.3 s, LCP 2.6 s, TBT 160 ms, CLS 0, zero console errors, and zero non-composited-animation findings. The 844×390 landscape audit recorded Performance 95, Accessibility 100, Best Practices 100, FCP 1.2 s, LCP 2.6 s, TBT 150 ms, CLS 0, and the same zero-error findings. Desktop recorded Performance 100, Accessibility 100, Best Practices 100, FCP 0.4 s, LCP 0.6 s, TBT 0 ms, and the same stability/error results. SEO remained 66 under the deliberate no-index boundary. The first mobile audit scored Accessibility 97 because the small `LOCKED` label measured 3.53:1 against white; changing that label to the darker semantic text token restored 100 in the rebuilt final audit. Original-size screenshots confirm a readable 2×2 state selector and stacked board at 375px, a single selector row plus two-column board at 844×390 and desktop, visible text labels in addition to color, and no horizontal clipping. Lighthouse covers the initial public state; deterministic tests separately exercise all four synthetic states and exact-match their 2-2-6-7 tool sets to runtime construction.

Command shape:

```powershell
npx --yes lighthouse http://localhost:3002 --chrome-path="C:\Program Files\Google\Chrome\Application\chrome.exe" --chrome-flags="--headless --no-sandbox --disable-gpu" --only-categories=performance,accessibility,best-practices,seo --output=json
```

The Chrome launcher produced an `EPERM` while deleting its temporary profile after writing each report. The final JSON report was present and parseable; the cleanup error did not alter the recorded scores.

## Deliberate SEO boundary

The default profile's only SEO failure is crawlability. `app/layout.tsx` and `app/robots.ts` intentionally disable indexing because `docs/READINESS.md` classifies this build as an engineering MVP, not a public clinical service. Do not enable the reviewed discovery profile merely to raise a competition score. Indexing requires the public-clinical readiness, legal, governance, monitoring, and incident-response gates to be approved first, plus an exact non-loopback HTTPS `SITE_URL` and `SITE_INDEXING_ENABLED=true`.

## Verification boundary

Lighthouse exercised a real local Chrome renderer and network lifecycle, including the final synthetic deep link at 375×667 and 844×390 landscape. It does not replace keyboard-only, screen-reader, large-text, or Chrome Model Context Tool Inspector acceptance. The installed browser-control package could not initialize because its packaged browser documentation directory is missing, so no claim is made about completed scripted clicks or WebMCP Inspector behavior.
