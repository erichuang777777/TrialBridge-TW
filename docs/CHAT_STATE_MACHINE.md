# Chat state machine

```text
WELCOME
  -> ROLE_AND_LANGUAGE
  -> PRIVACY_NOTICE
  -> CAPTURE_FREE_TEXT
  -> MASKING_REVIEW
  -> CLOUD_TRANSFER_CONSENT
  -> GPT_OSS_CLOUD_EXTRACTION
  -> FACT_CONFIRMATION
  -> MATCH_CONSENT
  -> MATCHING
  -> RESULTS_DIALOGUE
  -> OUTREACH_DRAFT
```

## Invariants

- Raw text can move only from capture to browser masking. Only the reviewed masked text can enter cloud extraction after explicit consent.
- `FACT_CONFIRMATION` cannot be skipped; every used fact has explicit confirmation.
- Editing a confirmed matching fact invalidates prior results.
- Cloud dialogue is optional and cannot start before confirmation plus a separate cloud-consent choice.
- WebMCP discovery may be passive, but sensitive execution requires an active page, an explicit user request, and a visible confirmation gate.
- The system always offers `unknown` and `skip` choices.
- A caregiver is reminded to verify uncertain facts with the patient or treating team.

## Recovery

Model, registry, and network failures return the conversation to the last safe state without losing the in-page draft. Refreshing the page deliberately clears the anonymous session.
