# WebMCP contract

WebMCP is a primary product interface, not an add-on. The site uses both Chrome's declarative form API and the `document.modelContext` imperative API, while remaining fully useful without an agent.

## Registered tool classes

### Visible declarative tool

- `search_public_trial_form` makes the existing `/trials` search form agent-discoverable. The agent fills the same visible condition and open-record controls a person uses; no duplicate or hidden form exists.
- Agent activation is announced visibly, submit uses the same search function, and `SubmitEvent.respondWith()` returns bounded, structured source-linked results.

### Public imperative tools

- `trialbridge_method` explains the Taiwan-first method, privacy boundaries, sources, and limitations.
- `search_public_cancer_trials` searches public TFDA and ClinicalTrials.gov records by a non-sensitive cancer topic and returns the same visible bilingual registry query provenance as the human form. Its bounded output reports `complete`, `partial`, or `unavailable` coverage; completed sources include counts, elapsed milliseconds, query times, and live/fresh-cache/stale-cache snapshot state, while failed sources include a bounded code and latency. Cached, timed-out, or partial results therefore cannot appear live and complete.

### Sensitive contextual tools

- `review_trial_followups` reads the current registry-derived missing-question list and returns an actionable workflow state. It cannot record, infer, or confirm an answer.
- `explain_confirmed_matches` reads the current confirmed, de-identified comparison state.
- `draft_trial_outreach` creates an unsent outreach draft from a current match and confirmed summary.
- `draft_trial_discussion_brief` creates but never sends a bounded care-team brief from confirmed facts and current source-linked comparisons. It labels registry evidence, unknowns, and non-eligibility explicitly.
- `compare_shortlisted_trials` appears only after the person visibly selects two or three current result cards. It reads that shortlist and returns a compact public-record comparison; it accepts no trial IDs and cannot add, remove, reorder, or otherwise choose trials.

## Security invariants

- No tool accepts or returns raw medical-record text, uploaded documents, direct identifiers, model prompts, cookies, or server tokens.
- Sensitive tools read only an in-memory, confirmed, de-identified summary and require active consent for each execution context.
- Registry output is tagged as untrusted external content and length-bounded.
- Tools never send messages, submit forms, enroll, schedule, consent, change treatment, or perform background surveillance.
- Tool results include source registry, retrieval time, limitations, and a patient-facing safety statement. Public search also preserves registry-level completion and failure status inside the output budget.
- Imperative registration and cleanup are deterministic across client navigation, confirmed-summary permission, shortlist changes, and hot reload.
- Declarative agent activity remains visible, focused, cancellable, and announced to assistive technology.
- Declarative cancellation clears visible agent state for both the upstream `toolcanceled` event and Chromium Origin Trial's current `toolcancel` event.
- Imperative executions publish a payload-free visible status (`running`, `completed`, `failed`, or `cancelled`) so an agent call never becomes an invisible page action.
- Each imperative execution consumes the execution callback's `AbortSignal`. Cancellation propagates through the client request, Next.js request signal, matching layer, and registry adapters; the caller's abort reason is preserved instead of being relabeled as a registry timeout.
- Registration and execution cancellation are separate lifecycle boundaries. Aborting a registration removes the exposed tool set but does not retroactively cancel already in-flight executions; cancelling one execution aborts only that request. A caller leaving the shared TFDA load stops waiting immediately without terminating the single-flight snapshot work used by other callers.
- The current tab retains at most 20 payload-free lifecycle events. A user-triggered JSON receipt may include UTC time, tool names, verified additions/removals, and execution states only; it excludes notes, profile facts, trial results, prompts, arguments, outputs, and error details, and is never uploaded.

## Canonical contract evidence

The visible declarative form and all seven imperative tools import their names, descriptions, input schemas, and imperative annotations from `lib/webmcp/toolContractCore.ts`. The derived catalog adds only explanatory metadata: registration style, availability, data boundary, human control, recovery, output trust, and measured Chrome guidance budgets. `/webmcp` renders that catalog as a searchable disclosure interface, while `/webmcp/contracts.json` exposes the same static no-health-data representation.

This eliminates a separate hand-maintained judge schema that could drift from runtime authority. It does not turn the catalog into a protocol endpoint or prove current-browser registration, tool selection, execution, cancellation, or cleanup.

## Verification target

`npm run verify:webmcp` statically checks both API styles, exact runtime/catalog contract equality, current Chrome name/description/parameter/output budgets, object-first/current-Chrome serialized execution compatibility, cancellation event compatibility, execution-signal propagation, schemas, annotations, output caps, same-origin exposure, security headers, deprecated API absence, the eleven-case journey manifest, and freshness/privacy invariants for the recorded cloud-model selection artifact. Deterministic tests additionally verify exact abort-reason preservation, downstream adapter cancellation, and shared TFDA-load isolation. Chrome Model Context Tool Inspector must still confirm real discovery, manual calls, natural-language selection in Chrome, declarative form activation, sensitive consent behavior, cancellation, and tool cleanup.

The public `/webmcp/evidence.json` judge bundle mirrors the capability inventory and classifies each conformance claim as `repository_verified`, `recorded_model_eval`, or `manual_gate`. It contains evidence paths, primary links, audit metadata, and the full selection-dataset/tool-contract digests. It is static competition evidence: it reads no browser session, medical workflow state, note, profile, result, chat, prompt, argument, or output, and it does not extend the WebMCP protocol.
