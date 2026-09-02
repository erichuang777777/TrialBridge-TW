# Local development and deployment gates

## Windows local run

1. Install Ollama and ensure `gpt-oss:120b-cloud` is listed. Local GPU and CPU inference are prohibited.
2. Run `ollama signin`; both extraction and optional dialogue use the Ollama cloud service.
3. Copy `.env.example` to `.env.local`; do not add patient data or provider API keys.
4. Run `npm install`, then `npm run dev`.
5. Run `npm test`, `npm run typecheck`, `npm run build`, `npm run verify:registries`, `npm run verify:http`, and `npm run audit:clean-room`.
6. With the application running, explicitly run `npm run verify:cloud` when a real provider-availability check is intended. This command is not part of CI and uses one cloud request.

In `npm run dev`, a clearly marked shortcut bar can open the note, masking, summary-confirmation, or trial-card stages with synthetic fixture data. It exists only for interface development; the reducer rejects stage-jump events outside `NODE_ENV=development`, and the fixture must never contain patient data.

## Public deployment is intentionally gated

The server-side localhost proxy reaches the server machine, not a visitor's computer, and it does not make cloud inference local. Public deployment requires a reviewed proxy architecture, provider data-processing terms, explicit consent records, and a Taiwan privacy-law review.

The MVP applies fixed-window, per-process limits before parsing bodies on cloud extraction, guided intake, result dialogue, matching, and public registry search. It hashes the trusted proxy address and never uses medical payloads as a key. A public multi-instance deployment must replace the process-local rate limiter with a reviewed shared store, configure the scheduled TFDA snapshot below, and configure the edge or trusted proxy to overwrite forwarded-address headers. Keep monitoring metadata-only.

## Scheduled TFDA ingestion

Set the same absolute file path in the ingestion job and every application instance. The location must be a shared durable volume, not the image layer or a temporary directory:

```text
TFDA_SNAPSHOT_PATH=/var/lib/trialbridge/public-registry/tfda-public.json
```

Run this command at least daily from the scheduler identity that has write access to that directory:

```bash
npm run sync:tfda-snapshot
```

The command downloads only the fixed official TFDA dataset URL, validates and bounds the archive, writes a self-validating public-record artifact plus `.manifest.json`, and prints count, UTC timestamp, SHA-256, byte size, and `containsPatientData=false`. It never prints the path or records. Temporary files are renamed into place; readers never accept a partial JSON write. Application instances may mount the finished files read-only.

Do not configure `TFDA_SNAPSHOT_PATH` until the first successful job has produced both files. Once configured, a missing, corrupt, mismatched, future-dated, or more-than-seven-day-old artifact has no live-download fallback and degrades `GET /api/health` to 503. A 24-hour-to-seven-day artifact remains usable but reports `stale`; alert on that state before it expires. The default unconfigured `request_time_fallback` is for development only.

Provisioning the scheduler and shared volume is outside this repository. Production acceptance must record the scheduler cadence, last successful run, volume durability/backup, alert owner, and recovery drill without copying registry records or any patient content into monitoring.

WebMCP and ordinary HTTP cancellation propagate through `request.signal` to registry work. ClinicalTrials.gov receives the abort directly. A cancelled TFDA caller stops waiting immediately, but does not terminate the process-wide single-flight snapshot refresh because other requests may depend on the same load. Public monitoring must record cancellation as payload-free lifecycle metadata and must not classify a caller abort as a source timeout.

`GET /api/health` exposes only service/version and configuration-class checks. It does not call the model, reveal the loopback URL, Origin Trial token, TFDA filesystem path, registry records, or patient data. Its bounded TFDA object reports deployment state, generation time, record count, storage class, and `containsPatientData=false`. Its bounded Origin Trial object distinguishes `local_testing_only`, `configured_unverified`, and `misconfigured`, always keeps `containsToken=false`, and never turns token presence into a Chrome success claim. A `200` proves configuration shape and an acceptable snapshot age, not live provider or Origin Trial availability; a `503` means the allowlisted cloud model, loopback proxy, token/origin pairing, or configured TFDA snapshot is invalid.

`POST /api/cloud/probe` is the separate opt-in availability check. It accepts no request body, uses only a fixed repository-owned synthetic prompt, calls `gpt-oss:120b-cloud` through the loopback Ollama proxy, and stops after 30 seconds. It returns requested/reported model, transport class, latency, and UTC check time; it never returns or stores model content. The MVP allows three provider calls per process/address per 10 minutes. A successful probe proves only that this server reached a provider response at that moment—it does not establish provider retention terms, legal acceptance, production SLA, clinical accuracy, or Chrome WebMCP Inspector behavior.

`POST /api/demo/preflight` is a competition-only operational check. It also accepts no body and shares the same three-per-ten-minute `cloud-probe` bucket, so it cannot bypass the provider allowance. The route runs the fixed cloud probe and a fixed public `gastric cancer` lookup against TFDA and ClinicalTrials.gov in parallel, propagates `request.signal`, and returns only source states, counts, cache/live metadata, latency, and bounded failure codes. It never returns trial records, provider text, or health information. A ready or partial receipt is demo-dependency evidence only, not a health check for load balancers, WebMCP verification, registry-completeness claim, or clinical validation.

`GET /webmcp/evidence.json` is a force-static public competition artifact with a five-minute cache policy. It contains capability metadata, the four-state synthetic registration model, the six-check runtime-suite definition, a dated metadata-only summary of the recorded Chrome 153 6/6 receipt, evidence classes, source paths/links, and selection-artifact digests. It reads no request, current browser session, note, profile, results, or chat. The state model and suite definition remain repository evidence; `evals/webmcp-browser-runtime-acceptance.json` is explicitly recorded local-browser evidence rather than a current-viewer or production-deployment claim.

`GET /webmcp/contracts.json` is a separate force-static implementation-contract catalog with the same cache policy. It contains the eight canonical tool names, descriptions, schemas, annotations, availability rules, human-control/recovery boundaries, and measured Chrome guidance budgets. It reads no request, browser session, medical workflow, note, profile, result, or chat. It is not a protocol endpoint and cannot prove current-browser discovery, execution, or Inspector behavior.

The live diagnostic first creates a schema-1.1 browser receipt only after an explicit download. Its lifecycle section contains the fixed six check IDs/outcomes, bounded `toolchange` count, and no tool arguments or outputs. The adjacent six-check Inspector kit keeps outcomes only in the current React tab and can create a second, download-only manual receipt. It stores case IDs and outcomes, the exact origin, Chrome major version, and summary counts; it excludes prompts, tool arguments/outputs, and health information. `npm run verify:webmcp:receipts -- <runtime.json> [manual.json]` validates both structures, while preserving `manual_self_attestation` as a separate evidence class. Do not ingest either local receipt into application telemetry or patient records.

Before release, resolve every item in `READINESS.md`, provision and exercise the scheduled TFDA job on shared durable storage, replace process-local limits with distributed rate limiting and payload-free monitoring, obtain the exact WebMCP origin-trial token, and complete Chrome Inspector plus accessibility/browser acceptance.

For the exact registered first-party origin, provide both variables during the production build:

```text
SITE_URL=https://the-exact-registered-origin.example
WEBMCP_ORIGIN_TRIAL_TOKEN=the-unmodified-token-from-Chrome
```

The token is public by design once emitted in `<head>`, but the server-only variable prevents accidental duplication in client JavaScript. The build fails closed for whitespace, invalid shape, HTTP/loopback origins, or a path-bearing `SITE_URL`. Configuration can only reach `configured_unverified`; verify origin match, expiry, status, and feature availability in Chrome DevTools before making any production Origin Trial claim.

### Public discovery profile

The default build emits `noindex`, blocks crawlers in `/robots.txt`, and returns an empty sitemap. It still provides canonical/page metadata, `/manifest.webmanifest`, and local-font social preview images so the release surface can be inspected without weakening the clinical-readiness boundary.

Only after every required readiness, legal, governance, monitoring, and incident-response gate is approved may deployment set both:

```text
SITE_URL=https://the-exact-reviewed-origin.example
SITE_INDEXING_ENABLED=true
```

`SITE_URL` accepts an origin only—no path, query, credentials, or fragment. Indexing requires non-loopback HTTPS; an unsafe or malformed requested profile fails the build instead of silently becoming public. The generated sitemap lists only the five human-facing routes and `robots.txt` continues to exclude `/api/`.

No deployment may enable automated outreach, enrollment, booking, consent, or treatment recommendations.
