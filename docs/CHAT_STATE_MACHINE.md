# Chat state machine

```text
WELCOME
  -> LANGUAGE_AND_MODE (agent or manual; no patient/caregiver question)
  -> PRIVACY_NOTICE
  -> ENTER_NOTE (agent chat or manual entry into one shared note)
  -> CLOUD_ORGANIZATION_ACTION
  -> GPT_OSS_CLOUD_EXTRACTION
  -> MASKED_NOTE_AND_FACT_CONFIRMATION (same review page)
  -> MATCH_CONSENT
  -> CANDIDATE_DISCOVERY
  -> SOURCE_DERIVED_CLARIFICATION
  -> CONFIRMED_PROFILE_UPDATE
  -> MATCHING_AND_GROUPING
  -> OPTIONAL_VISIBLE_SHORTLIST (2-3 current result cards)
  -> RESULTS_DIALOGUE
  -> OUTREACH_DRAFT
```

## Invariants

- Agent mode uses chat as the workflow controller; manual mode exposes direct entry, extraction, and confirmation controls. Switching modes preserves the same volatile intake note.
- Patient-versus-caregiver identity is not an intake gate and the Agent is explicitly instructed not to ask for it. A neutral internal default exists only for profile-schema compatibility.
- Only browser-masked text can enter cloud extraction after the visible cloud-organization action. A separate mask-review screen appears only as an error recovery state.
- `FACT_CONFIRMATION` cannot be skipped; every used fact has explicit confirmation.
- The masked note and extracted facts remain visible together during confirmation. One bulk action may mark every visible fact confirmed; editing a fact immediately clears that fact's confirmation.
- Confirmation does not open a separate summary-complete screen. The same review remains visible while candidate requirements are checked, and follow-up answers do not require a second bulk-confirmation checkbox.
- Candidate trial requirements are allowed to generate pre-result questions, but unanswered or explicitly unknown responses never become matching facts.
- Editing a confirmed matching fact invalidates prior results.
- Cloud dialogue is optional and cannot start before confirmation plus a separate cloud-consent choice.
- WebMCP discovery may be passive, but sensitive execution requires an active page, an explicit user request, and a visible confirmation gate.
- The shortlist is volatile, capped at three current results, and changed only by visible human controls. Its comparison tool is absent until two selections exist and accepts no trial identifiers.
- The system always offers `unknown` choices where a trial requirement needs information.
- A caregiver is reminded to verify uncertain facts with the patient or treating team.

## Recovery

Model, registry, and network failures return the conversation to the last safe state without losing the in-page draft. Refreshing the page deliberately clears the anonymous session.
