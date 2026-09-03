# Execution plan: local Ollama + SQLite → Netlify + Ollama Cloud API + Turso

Status of the deployment work, phase by phase. Checked items are implemented and
covered by `npm test`, `npm run typecheck`, `npm run verify:webmcp`, and
`npm run build`, or were completed in the hosting accounts (Turso, Netlify,
GitHub Actions); unchecked items still need an external action or a live
measurement. The production site is https://trialbridge-tw.netlify.app/.

## Phase 0 · Correctness and CI

- [x] `verify:webmcp` marker updated after the index-aware loading copy (CI was red on `main`).
- [x] Sex eligibility compares normalized enums instead of substrings (`"FEMALE".includes("MALE")`).
- [x] Condition overlap adds CJK bigrams so `非小細胞肺癌` matches `肺癌`.
- [x] Empty-note dead end after a failed extraction, blank zero-result screen, and matching errors shown as an outreach draft.
- [x] GitHub links point at this repository.

## Phase 1 · Model transport

- [x] `resolveOllamaEndpoint()`: loopback proxy (`gpt-oss:120b-cloud`, no key) or Ollama Cloud API (`gpt-oss:120b`, server-only `OLLAMA_API_KEY`); anything else fails closed.
- [x] All six model call sites, health, receipts, preflight, rehearsal, and `verify:cloud` report the transport name only.
- [x] `POST /api/cloud/extract` streams server-sent events (`accepted`, `progress` with character counts, `result`/`failure`); the browser shows progress and validates only the final draft.
- [x] `CLOUD_EXTRACTION_TIMEOUT_MS` server ceiling; `num_predict` lowered to 3072.
- [x] Ollama Cloud API transport is live on Netlify (`OLLAMA_API_KEY` set in the Netlify UI).
- [ ] Measure p50/p95 extraction latency through the Cloud API and record it here.
- [ ] Confirm a 12-second-plus streamed extraction is not cut at 10 seconds on the hosted site. If it is, add Netlify Edge Functions under `netlify/edge-functions/` for the four `/api/cloud/*` paths, importing the same `lib/llm/*` modules.

## Phase 2 · Trial index on Turso

- [x] `LibsqlTrialIndexStore` (`lib/trials/index/libsql.ts`): same schema and FTS5 index as the SQLite store, async `@libsql/client`, memoized initialization, read-only mode, recruitment filter pushed into SQL, health from `source_state`.
- [x] Lazy store factory: `TRIAL_INDEX_BACKEND=sqlite|libsql|postgres`; `node:sqlite` and native drivers are only imported when used.
- [x] Per-source live fallback in the catalog; `TFDA_LIVE_FALLBACK=false` reports TFDA as unavailable instead of downloading 175 MB inside a request; `/api/data-health` exposes `indexAccess`.
- [x] `TRIAL_INDEX_PROFILE=full|demo` applied by the scheduled sync; `npm run export:trial-index-subset` writes an upload-ready subset with the FTS index built.
- [x] Scheduled sync workflow targets Turso with a read-write token; Node 22 everywhere.
- [x] Turso database created; Netlify reads it with a read-only token and the `sync-trial-index` workflow writes with a read-write token from GitHub secrets (first successful scheduled run took about 40 minutes, so FTS5 writes over HTTPS work).
- [x] `search()` fetches identifiers for a ranked window of up to 200 rows and transfers `payload_json` only for the rows that can fill the page, so `/trials` shows 20 records again without exceeding Netlify's synchronous budget.
- [ ] Decide between the demo subset and the full 4 GB (free tier is 5 GB including FTS).
- [ ] Publish the full SQLite file as a GitHub Release asset with a fetch script for contributors.

## Phase 3 · Netlify configuration

- [x] `netlify.toml`: Node 22, esbuild, `data/public/**` bundled, libsql read-only, TFDA live fallback off, demo rate-limit profile, 55-second extraction ceiling.
- [x] Rate limiting reads Netlify's `x-nf-client-connection-ip` first; `RATE_LIMIT_PROFILE=demo` widens only model-backed buckets.
- [x] Deployment, threat model, readiness, README, and `.env.example` describe both transports, the Turso index, and the Netlify variables.
- [x] Site deployed at `trialbridge-tw.netlify.app` with `OLLAMA_API_KEY`, `TRIAL_INDEX_LIBSQL_URL`, and the read-only `TRIAL_INDEX_LIBSQL_AUTH_TOKEN` set in the Netlify UI.
- [ ] Optional custom domain: add it in Netlify, enable Force HTTPS, set `SITE_URL` to the exact origin, and re-issue the Origin Trial token for that origin.
- [ ] Post-deploy checklist from `docs/DEPLOYMENT.md` (headers, health, data-health, `胃癌` search, cloud probe, synthetic extraction).

## Phase 4 · WebMCP in production

- [x] `WEBMCP_ORIGIN_TRIAL_TOKEN` is served as `<meta http-equiv="origin-trial">` on the live site.
- [ ] Confirm Chrome accepts the token: the quickstart console's "WebMCP enablement" check must read "Origin Trial token active" without the local flag. A headless capture logged `Origin trial controlled feature not enabled: 'tools'`, which is what a rejected or expired token looks like.
- [ ] Test in the ChatGPT desktop browser (GPT-5.6 Sol or Terra): method, public search, declarative form, shortlist comparison, forbidden enrollment; record results in `lib/webmcp/implementationLandscape.ts`.
- [ ] Add a public read-only `get_public_trial_details` tool so agents can drill into one record.

Browser capture scripts (`scripts/capture-webmcp-promo.mjs`,
`scripts/probe-webmcp-execution.mjs`, `scripts/record-webmcp-youtube.mjs`)
read `TRIALBRIDGE_BASE_URL`, `CHROME_PATH`/`CHROME_CHANNEL`, and
`PLAYWRIGHT_MODULE`, so they run on any machine with Chrome and a Playwright
install.

## Phase 5 · Demo experience

- [ ] Pre-generated synthetic extraction for `/match?demo=synthetic` and a `demo=results` entry.
- [ ] Traditional Chinese landing, `/trials`, and quickstart; `html lang` follows the selection.
- [ ] Chat auto-scroll, Enter to send, focus management, narrower `aria-live` regions, mobile chat panel.
- [ ] Trim `/webmcp` into judge screens plus a technical appendix.
