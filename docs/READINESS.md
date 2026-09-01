# Readiness status

## Verified in this repository

- Clean-room replacement and tracked-file legacy scan.
- Anonymous in-memory chat state with no browser persistence API.
- Browser masking fixtures plus server-side identifier rejection.
- Exact `gpt-oss:120b-cloud` allowlist, loopback-only proxy, and prohibition on local GPU or CPU inference.
- Patient-confirmed profile boundary and separate cloud/WebMCP consent.
- Live TFDA zipped JSON parsing and ClinicalTrials.gov API v2 retrieval.
- A visible, versioned bilingual query plan covering all 19 declared cancer groups, with exact-term mapping and non-inferential pass-through for unrecognized detail.
- Taiwan-to-Asia-to-world ranking, explicit-ID deduplication, and source traces.
- Live synthetic `gpt-oss:120b-cloud` extraction, confirmed-profile matching, and separately consented cloud dialogue.
- One visible declarative WebMCP registry-search form plus up to seven read-only imperative tools, output limits, untrusted-content annotations, consent-driven sensitive registration, state-aware pending-question recovery, and a comparison capability that appears only after two visible shortlist selections.
- Eleven deterministic WebMCP journey cases plus a version-locked, no-PHI `gpt-oss:120b-cloud` selection baseline: 54/55 expected tool calls or safe abstentions across direct, ambiguous, recovery, and forbidden intents. Shortlist comparison was 5/5 and forbidden abstention was 10/10; one method request returned an empty response with no tool call. This does not replace the browser Inspector gate.
- Deterministic WebMCP conformance verification and GitHub CI gates for tests, types, clean-room boundaries, dependency audit, and production build.
- A built-in `/webmcp` competition-evidence page that reports current-browser support, public tool discovery, same-origin security headers, safe method execution, and the remaining Inspector boundary.
- A bounded, payload-free WebMCP session receipt that makes capability registration changes and tool lifecycle states visible and optionally downloadable without server persistence.
- TypeScript, production build, dependency audit, HTTP routes, and security headers.
- A payload-free configuration health endpoint and pre-body, process-local rate limits with machine-readable `429`/`Retry-After` responses.
- Fail-closed public discovery: canonical and share metadata, local-font Open Graph/Twitter images, a manifest, and dynamic robots/sitemap routes. Indexing requires an explicit non-loopback HTTPS deployment profile and remains disabled by default.

## Not yet proven and required before public clinical use

- No cancer group is clinically validated. All 19 coverage groups are `unreviewed`; searchability is not accuracy.
- The 19-group bilingual query lexicon is an engineering navigation aid and has not been adjudicated by an oncology terminologist; its visible mapping is not a clinical translation claim.
- Deterministic masking cannot guarantee removal of every name or contextual identifier.
- Provider retention, data-processing location, terms, outage behavior, and production latency for cloud extraction are not yet accepted.
- TFDA's full archive is currently decompressed on first request; production needs a scheduled validated snapshot.
- Eligibility criteria beyond structured condition, recruitment, age, sex, and region are not yet atomically assessed.
- No oncologist/research-nurse adjudicated gold set, false-eligible measurement, calibration, or subgroup fairness evaluation exists.
- Taiwan privacy-law review, clinical governance, threat-model review, incident response, data-processing records, abuse controls, and user research are incomplete.
- Chrome Model Context Tool Inspector was not run because the installed browser-control runtime is incomplete. The separate 55-sample Ollama tool-calling baseline does not verify browser registration, execution, or permission transitions.
- Visual QA at 375px, landscape, large text, keyboard-only, screen reader, and reduced motion has not been run in a real browser.

TrialBridge TW is therefore an engineering MVP for controlled local development, not a public clinical service.
