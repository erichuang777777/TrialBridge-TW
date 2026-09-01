# Canonical schemas

## Confirmed patient profile

The implementation schema will be defined in Zod and versioned. Each medical fact contains:

- `value`: normalized value or explicit unknown.
- `display`: patient-readable Traditional Chinese and English labels.
- `source`: `user_statement`, `masked_note`, or `caregiver_statement`.
- `confidence`: extraction confidence, never eligibility confidence.
- `confirmed`: must be true before matching.
- `confirmedAt`: in-session timestamp.

Core domains: cancer type, primary site, histology, stage or extent, biomarkers, prior and current therapies, diagnosis and treatment dates at month granularity, performance status when explicitly known, major organ function when explicitly known, age band, sex eligibility context, country or travel preference, and questions for the study team.

Names, national IDs, medical-record numbers, exact addresses, phone numbers, emails, full birth dates, clinician names, and facility-specific identifiers are forbidden.

## Trial record

A normalized trial preserves source-specific identifiers and raw-source provenance. Core fields: registry, registry ID, public URL, titles, recruitment status, study type, phases, conditions, interventions, eligibility text, structured age and sex, locations, contacts when public, first and last update dates, and retrieval timestamp.

## Match explanation

Each criterion is classified `possibly_met`, `possibly_not_met`, or `unknown`, with links to both the exact confirmed profile fact and the exact registry source field. Overall output is `discuss`, `needs_information`, or `unlikely_based_on_public_record`; it is never `eligible`.
