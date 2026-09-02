# Registry layer

## Official sources

- TFDA Taiwan drug clinical-trial status dataset: <https://data.gov.tw/dataset/177198>. Monthly, Traditional Chinese, Taiwan-approved drug trials, Open Government Data License 1.0.
- ClinicalTrials.gov API v2: <https://clinicaltrials.gov/data-api/api>. Public study records refreshed on weekdays; the adapter records `/api/v2/version` when available.

## Retrieval contract

The server accepts `POST /api/trials/search` so a cancer term is not copied into browser history or ordinary query-string logs. The request is bounded to 2–120 characters and 1–100 results per source. Response caching is disabled.

Both adapters run independently with a fixed 20-second source deadline. One registry failure or timeout is returned with a machine-readable code and elapsed milliseconds and does not erase verified results from the other source. Every successful source receipt reports its own elapsed milliseconds and identifies whether its data came from a live load, a process-memory snapshot, or a validated scheduled file, plus the actual snapshot generation time; the visible search and WebMCP output preserve that state. ClinicalTrials.gov receives the deadline's `AbortSignal`. A shared TFDA cold snapshot is allowed to finish in the background so one request timeout cannot cancel the single-flight load for concurrent readers.

## Scheduled TFDA snapshot contract

Production sets `TFDA_SNAPSHOT_PATH` to one absolute `.json` file on shared durable storage and runs `npm run sync:tfda-snapshot` at least daily outside request handling. The job downloads only the fixed official TFDA endpoint, validates archive and decompressed limits plus every record, creates a self-contained schema-1.0 artifact, computes the records SHA-256 and count, and replaces both the artifact and its small `.manifest.json` sidecar through temporary-file renames. The manifest contains provenance and operational metadata only; neither file contains patient-authored data.

Application readers verify file size, strict source URLs, schema, record count, digest, timestamp, and sidecar agreement. A configured missing, malformed, tampered, future-dated, or older-than-seven-days snapshot fails closed without silently returning to request-time download. From 24 hours through seven days the record receipt is explicitly `stale_cache` with `storage=scheduled_file` and states that the ingestion job must refresh it.

`GET /api/health` reports only `request_time_fallback`, `fresh`, `stale`, `expired`, `missing`, or `misconfigured`, together with bounded generation/count metadata and `containsPatientData=false`. It never returns the configured filesystem path or public record contents. Missing, expired, and invalid configured artifacts degrade health to HTTP 503; the unconfigured development fallback remains HTTP 200.

The metadata-only [recorded ingestion receipt](../evals/tfda-snapshot-ingestion.json) preserves one 2026-09-02 official-source run: 18,493 validated records, a 175,674,023-byte artifact, scheduled-file adapter retrieval with network fallback prohibited, and the artifact SHA-256. It explicitly records that the large temporary artifact was removed and does not claim continuous production operation.

## Bilingual query bridge

Direct public search applies a versioned deterministic lexicon covering the same 19 cancer groups declared in the all-cancer coverage matrix. An exact Traditional Chinese or English alias produces two visible registry-specific terms: Traditional Chinese for TFDA and English for ClinicalTrials.gov. The response carries the strategy, lexicon version, canonical coverage group, both outgoing terms, and a limitation statement; the human form and both public WebMCP search patterns expose the same plan.

The bridge is terminology navigation, not clinical translation. It performs exact normalized alias matching only. A detailed or unrecognized term is sent unchanged to both registries, and the product does not infer histology, subtype, stage, biomarker, or eligibility. The matching flow separately uses the person's confirmed bilingual labels from the extraction and confirmation boundary.

## Normalization and provenance

Every normalized record keeps registry ID, public URL, retrieval time, source update time, license when supplied, recruitment wording, locations, criteria, and cross-registry identifiers. Registry prose remains untrusted external content.

The current TFDA export does not include a dependable recruitment-status, study-site, or site-investigator field. TrialBridge TW therefore keeps matching TFDA approvals as `unknown` recruitment records when the search includes non-open records; it does not infer Recruiting from a planned end date. When the same protocol has an exact shared identifier in ClinicalTrials.gov, deterministic deduplication supplements the TFDA-first record with the registry's published recruitment state, locations, eligibility age/sex fields, and investigator or contact data. Without that exact identifier, the UI says that status or sites were not published and directs the person to the source or study team.

The visible database and patient matching workflow load recruiting, closed, completed, and status-unpublished records before applying Phase, Location, and Recruitment filters. This prevents a healthy TFDA response from appearing useless merely because its current export cannot support a Recruiting-only filter. Recruiting remains a distinct official label; the product never replaces it with the broader phrase “accepting patients.”

Deduplication occurs only when records share an explicit normalized identifier such as a protocol number. Similar titles alone never trigger a merge. When records are merged, every source is retained and Taiwan fields lead the display record.

## Geographic priority

Records sort by:

1. Taiwan source or Taiwan location.
2. Other Asian location.
3. Worldwide location outside Asia.
4. Missing location.

Within a tier, trials accepting new participants precede closed trials, then more recently updated records. Travel distance is not inferred.

## Known limitation

When `TFDA_SNAPSHOT_PATH` is not configured, local development retains the previous request-time fallback: a cold server process downloads, validates, and decompresses the large official export with archive and decompressed-size limits, then uses a process-local 24-hour fresh/seven-day bounded stale-while-revalidate cache. This fallback is intentionally visible in health and source receipts and is not the production deployment profile. The repository now supplies the ingestion command and validated reader, but an actual production scheduler, shared volume, backup policy, monitoring, and operator ownership remain deployment responsibilities.
