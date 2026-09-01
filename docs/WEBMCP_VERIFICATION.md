# WebMCP implementation and verification

## Registered tools

Visible on `/trials` through declarative WebMCP:

- `search_public_trial_form`: the existing public search form, with visible agent activation and same-path submission.

Always available on supporting browsers:

- `trialbridge_method`: product method and boundaries; read-only.
- `search_public_cancer_trials`: bounded TFDA and ClinicalTrials.gov search; read-only and untrusted-content marked.

Registered only while the visible WebMCP consent checkbox is enabled and a confirmed profile exists:

- `review_trial_followups`: reads pending registry-derived questions and a recovery step; cannot accept or confirm answers.
- `explain_confirmed_matches`: current confirmed-profile explanations only.
- `draft_trial_outreach`: creates an unsent draft for a current match.
- `draft_trial_discussion_brief`: creates an unsent, source-traceable care-team brief with explicit uncertainty and no raw note.

Changing profile, pending questions, matching state, results, or consent aborts the previous registration before registering the current tool set. Tools are exposed only to the current origin. Tool names are at most 30 characters and output is capped at 1,500 serialized characters, following Chrome's current security guidance. No tool accepts raw or masked medical text and there are no send, submit, enroll, book, consent, or treatment-change tools. Each imperative execution emits a visible payload-free lifecycle status.

## Origin trial

Set `NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN` to emit the Chrome origin-trial meta token. For local testing, use a compatible Chrome build and its WebMCP testing flag.

## Required manual Chrome gate

Before public release, use Chrome Model Context Tool Inspector to verify discovery, schemas, manual invocation, natural-language selection, untrusted-content annotations, consent-driven tool addition/removal, cancellation, output limits, and absence of sensitive tools after reset.

This repository has unit, type, build, HTTP, and `npm run verify:webmcp` validation, plus ten deterministic journey contracts. A separate no-PHI baseline sent those journeys to `gpt-oss:120b-cloud` five times and recorded 50/50 expected tool calls or safe abstentions. See [`WEBMCP_SELECTION_EVAL.md`](WEBMCP_SELECTION_EVAL.md). This finite, single-turn Ollama tool-calling result does not execute WebMCP or prove Chrome behavior. Inspector validation is currently not claimed because the installed browser-control package is incomplete and cannot initialize its Chrome control session.

## In-product evidence page

Open `/webmcp` to inspect the current browser without providing medical data. The page registers the two public imperative tools, queries same-origin discovery, checks the WebMCP Permissions Policy plus isolation and MIME headers, and exposes a safe `trialbridge_method` execution check when supported. It also renders the recorded 50-sample selection baseline with its exact limits and artifact digests. Neither evidence surface substitutes for Model Context Tool Inspector.
