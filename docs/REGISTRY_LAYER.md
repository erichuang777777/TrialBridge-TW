# Registry layer

## Official sources

- TFDA Taiwan drug clinical-trial status dataset: <https://data.gov.tw/dataset/177198>. Monthly, Traditional Chinese, Taiwan-approved drug trials, Open Government Data License 1.0.
- ClinicalTrials.gov API v2: <https://clinicaltrials.gov/data-api/api>. Public study records refreshed on weekdays; the adapter records `/api/v2/version` when available.

## Retrieval contract

The server accepts `POST /api/trials/search` so a cancer term is not copied into browser history or ordinary query-string logs. The request is bounded to 2–120 characters and 1–100 results per source. Response caching is disabled.

Both adapters run independently. One registry failure is returned as an explicit source failure and does not erase verified results from the other source.

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

The official TFDA resource is a large zipped JSON export. The local server loads and caches it for 24 hours with archive and decompressed-size limits. A production deployment should run a scheduled, validated snapshot job rather than decompressing the full source inside a request.
