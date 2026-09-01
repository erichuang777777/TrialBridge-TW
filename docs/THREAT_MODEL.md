# Threat model

## Protected assets

- Cancer and treatment information, identity clues, contact details, and caregiver relationship.
- Patient confirmation decisions and generated outreach drafts.
- Integrity and provenance of trial records and matching explanations.

## Principal threats and controls

| Threat | Required control |
| --- | --- |
| Direct identifiers sent to a model | Browser masking before any network call; local proxy rejects common identifiers; no raw-note API route |
| Sensitive data in browser persistence | Volatile state only; no `localStorage`, IndexedDB, service-worker cache, or URL query parameters |
| Cloud-model overreach | Separate unchecked opt-in before masked-note extraction; explicit disclosure that localhost is only a proxy; exact `gpt-oss:120b-cloud` allowlist; Zod validation; second consent for confirmed-profile dialogue |
| Prompt injection in registry text | Treat registry content as untrusted data; never execute embedded instructions; separate system policy from evidence |
| WebMCP over-disclosure | Tool schemas accept confirmed profile references or minimized facts only; sensitive tools require active consent and visible user action |
| Agent sends or enrolls | No send, submit, enroll, book, consent, or treatment-change tools |
| False certainty | Unknown is first-class; source and update date shown; final eligibility reserved for study team |
| Cross-user exposure | Anonymous in-memory sessions; no shared server conversation store |
| Log leakage | Metadata-only structured logs and automated secret/PHI fixtures |
| Stale or conflicting registries | Preserve source records, timestamps, and conflicts; never silently overwrite disagreement |

## Deployment gates

Public deployment requires security review, Taiwan privacy-law review, data-processing inventory, incident response, abuse controls, clinical governance, accessibility audit, and WebMCP origin-trial verification.
