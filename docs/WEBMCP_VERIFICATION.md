# WebMCP implementation and verification

## Registered tools

Always available on supporting browsers:

- `trialbridge_method`: product method and boundaries; read-only.
- `search_public_cancer_trials`: bounded TFDA and ClinicalTrials.gov search; read-only and untrusted-content marked.

Registered only while the visible WebMCP consent checkbox is enabled and a confirmed profile exists:

- `explain_confirmed_trial_matches`: current confirmed-profile explanations only.
- `draft_trial_outreach`: creates an unsent draft for a current match.

Changing profile, matches, or consent aborts the previous registration before registering the current tool set. Tools are exposed only to the current origin. Output is capped at 6,000 serialized characters. No tool accepts raw or masked medical text and there are no send, submit, enroll, book, consent, or treatment-change tools.

## Origin trial

Set `NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN` to emit the Chrome origin-trial meta token. For local testing, use a compatible Chrome build and its WebMCP testing flag.

## Required manual Chrome gate

Before public release, use Chrome Model Context Tool Inspector to verify discovery, schemas, manual invocation, natural-language selection, untrusted-content annotations, consent-driven tool addition/removal, cancellation, output limits, and absence of sensitive tools after reset.

This repository has unit, type, build, and HTTP validation. Inspector validation is currently not claimed because the installed browser-control plugin is missing its required runtime file.
