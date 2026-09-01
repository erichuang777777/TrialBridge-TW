# Product specification

## Purpose

TrialBridge TW helps people affected by cancer reduce the work of finding and discussing recruiting clinical trials. It serves patients and caregivers in Traditional Chinese and English, starts with Taiwan, then expands to Asia and worldwide.

## MVP journey

1. The person selects English or Traditional Chinese, then Agent mode or Manual mode. Patient/caregiver identity is not requested; the same workflow begins immediately for everyone.
   A clearly labelled synthetic competition case can prefill fictional data, but it cannot skip privacy, masking, cloud extraction, confirmation, clarification, or matching.
2. Agent mode collects the situation through persistent chat; Manual mode accepts a pasted or typed note. Both update one shared, volatile intake note.
3. The browser masks direct identifiers before any model request.
4. After the person reviews the masked note and selects the visible cloud-organization action, `gpt-oss:120b-cloud` proposes structured facts through the localhost Ollama proxy, with provenance, uncertainty, and missing fields.
5. The person edits and confirms each fact.
6. Only the patient-confirmed, de-identified profile enters matching.
7. Results are retrieved Taiwan first, then Asia, then worldwide and explain source, freshness, possible mismatches, and unknowns.
8. Agent mode uses chat from intake through missing-field questions and result explanation. With visible permission, WebMCP can explain the pending question list but cannot record answers. Manual mode keeps direct controls available. Outreach is editable but never sent.
9. After results, the person may preview and explicitly download a local care-team discussion brief. It separates registry facts, uncertain applicability, potential exclusion signals, and questions for clinicians; it is never uploaded or sent by TrialBridge TW.

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
- No unmasked raw note reaches cloud assistance, trial registries, logs, analytics, or WebMCP. Masked notes reach only `gpt-oss:120b-cloud` after the visible cloud-organization action.
- The user can correct every extracted fact before matching.
- Critical flows are keyboard accessible and usable in Traditional Chinese and English.
