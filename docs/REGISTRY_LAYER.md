# Registry layer

## Official sources

- TFDA Taiwan drug clinical-trial status dataset: <https://data.gov.tw/dataset/177198>. Monthly, Traditional Chinese, Taiwan-approved drug trials, Open Government Data License 1.0.
- ClinicalTrials.gov API v2: <https://clinicaltrials.gov/data-api/api>. Public study records refreshed on weekdays; the adapter records `/api/v2/version` when available.

## Retrieval contract

The server accepts `POST /api/trials/search` so a cancer term is not copied into browser history or ordinary query-string logs. The request is bounded to 2–120 characters and 1–100 results per source. Response caching is disabled.

Both adapters run independently. One registry failure is returned as an explicit source failure and does not erase verified results from the other source. Every successful source receipt identifies whether its data came from a live load, a fresh process-local snapshot, or a bounded stale snapshot, plus the actual snapshot load time; the visible search and WebMCP output preserve that state.

## Bilingual query bridge

Direct public search applies a versioned deterministic lexicon covering the same 19 cancer groups declared in the all-cancer coverage matrix. An exact Traditional Chinese or English alias produces two visible registry-specific terms: Traditional Chinese for TFDA and English for ClinicalTrials.gov. The response carries the strategy, lexicon version, canonical coverage group, both outgoing terms, and a limitation statement; the human form and both public WebMCP search patterns expose the same plan.

The bridge is terminology navigation, not clinical translation. It performs exact normalized alias matching only. A detailed or unrecognized term is sent unchanged to both registries, and the product does not infer histology, subtype, stage, biomarker, or eligibility. The matching flow separately uses the person's confirmed bilingual labels from the extraction and confirmation boundary.

## Normalization and provenance

Every normalized record keeps registry ID, public URL, retrieval time, source update time, license when supplied, recruitment wording, locations, criteria, and cross-registry identifiers. Registry prose remains untrusted external content.

Deduplication occurs only when records share an explicit normalized identifier such as a protocol number. Similar titles alone never trigger a merge. When records are merged, every source is retained and Taiwan fields lead the display record.

## Geographic priority

Records sort by:

1. Taiwan source or Taiwan location.
2. Other Asian location.
3. Worldwide location outside Asia.
4. Missing location.

Within a tier, trials accepting new participants precede closed trials, then more recently updated records. Travel distance is not inferred.

## Known limitation

The official TFDA resource is a large zipped JSON export. A cold server process downloads, validates, and decompresses it with archive and decompressed-size limits. The resulting process-local snapshot is fresh for 24 hours. From 24 hours through seven days, a request immediately receives the last successful snapshot with an explicit `stale_cache` receipt while a single shared refresh runs; concurrent requests do not duplicate the download. A refresh failure never erases the last bounded snapshot, but data older than seven days is rejected rather than silently served. A production deployment still needs a scheduled, validated snapshot job in shared durable storage instead of relying on request-time cold loading or per-process memory.
