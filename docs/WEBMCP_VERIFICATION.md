# WebMCP implementation and verification

## Registered tools

Visible on `/trials` through declarative WebMCP:

- `search_public_trial_form`: the existing public search form, with visible agent activation and same-path submission.

Always available on supporting browsers:

- `trialbridge_method`: product method and boundaries; read-only.
- `search_public_cancer_trials`: bounded TFDA and ClinicalTrials.gov search; read-only and untrusted-content marked.

Registered only while the visible WebMCP consent checkbox is enabled and a confirmed profile exists:

- `explain_confirmed_matches`: current confirmed-profile explanations only.
- `draft_trial_outreach`: creates an unsent draft for a current match.

Changing profile, matches, or consent aborts the previous registration before registering the current tool set. Tools are exposed only to the current origin. Tool names are at most 30 characters and output is capped at 1,500 serialized characters, following Chrome's current security guidance. No tool accepts raw or masked medical text and there are no send, submit, enroll, book, consent, or treatment-change tools.

## Origin trial

Set `NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN` to emit the Chrome origin-trial meta token. For local testing, use a compatible Chrome build and its WebMCP testing flag.

## Required manual Chrome gate

Before public release, use Chrome Model Context Tool Inspector to verify discovery, schemas, manual invocation, natural-language selection, untrusted-content annotations, consent-driven tool addition/removal, cancellation, output limits, and absence of sensitive tools after reset.

This repository has unit, type, build, HTTP, and `npm run verify:webmcp` validation. Inspector validation is currently not claimed because the installed browser-control package is incomplete and cannot initialize its Chrome control session.

## In-product evidence page

Open `/webmcp` to inspect the current browser without providing medical data. The page registers the two public imperative tools, queries same-origin discovery, checks the WebMCP Permissions Policy plus isolation and MIME headers, and exposes a safe `trialbridge_method` execution check when supported. It is a transparent diagnostic aid, not a substitute for natural-language selection in Model Context Tool Inspector.
