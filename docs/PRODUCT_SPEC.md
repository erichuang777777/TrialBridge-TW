# Product specification

## Purpose

TrialBridge TW helps people affected by cancer reduce the work of finding and discussing recruiting clinical trials. It serves patients and caregivers in Traditional Chinese and English, starts with Taiwan, then expands to Asia and worldwide.

## MVP journey

1. The person selects patient or caregiver context and language.
2. They paste or type free text.
3. The browser masks direct identifiers before any model request.
4. After an unchecked, explicit cloud-transfer consent, `gpt-oss:120b-cloud` proposes structured facts through the localhost Ollama proxy, with provenance, uncertainty, and missing fields.
5. The person edits and confirms each fact.
6. Only the patient-confirmed, de-identified profile enters matching.
7. Results are retrieved Taiwan first, then Asia, then worldwide and explain source, freshness, possible mismatches, and unknowns.
8. Chat supports questions, comparison, and an editable outreach draft. It never sends the draft.

## Audiences

- Patient: understand possible options and prepare questions for the care team.
- Caregiver: help organize information and logistics without overriding patient agency.

## Cancer scope

The retrieval and schema layers support all cancers in one product. Each disease area carries a validation maturity label: `unreviewed`, `rules-reviewed`, or `clinically-reviewed`. Coverage is not an accuracy claim.

## Non-goals for MVP

- Diagnosing disease, recommending treatment, or predicting benefit.
- Declaring final eligibility or replacing the study coordinator.
- Saving raw records by default.
- Automated email, messaging, booking, enrollment, or consent.
- Background WebMCP access when the user is not present.

## Success measures

- Every match is traceable to registry fields and a confirmed profile fact.
- No unmasked raw note reaches cloud assistance, trial registries, logs, analytics, or WebMCP. Masked notes reach only `gpt-oss:120b-cloud` after explicit transfer consent.
- The user can correct every extracted fact before matching.
- Critical flows are keyboard accessible and usable in Traditional Chinese and English.
