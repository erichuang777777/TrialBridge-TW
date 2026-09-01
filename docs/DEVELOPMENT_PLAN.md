# Development plan

Each milestone is independently tested, committed, and pushed to `origin/main`.

1. Clean-room foundation: product spec, data flow, threat model, schemas, chat states, WebMCP contract, original visual system, and accessible shell.
2. Registry layer: TFDA and ClinicalTrials.gov adapters, normalization, provenance, deduplication, Taiwan-to-Asia-to-world retrieval, ranking, and fixtures.
3. Consented cloud extraction: browser masking, explicit transfer consent, localhost Ollama proxy to `gpt-oss:120b-cloud`, bilingual extraction, Zod validation, correction, and patient-confirmed profile.
4. Chat-first workflow: anonymous patient and caregiver experiences, recovery, language switching, consent, and session clearing.
5. Matching and dialogue: hybrid deterministic/model reasoning, bilingual traceable explanations, unknowns, comparison, and unsent outreach drafts.
6. WebMCP: public and sensitive tools, dynamic registration, consent gates, untrusted registry output, inspector and browser verification.
7. Readiness: all-cancer evaluation matrix, security and privacy tests, accessibility, end-to-end validation, deployment documentation, and final legacy-remnant audit.
