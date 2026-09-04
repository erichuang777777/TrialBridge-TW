# WebMCP contract

WebMCP is a primary product interface, not an add-on. The site uses both Chrome's declarative form API and the `document.modelContext` imperative API, while remaining fully useful without an agent.

## Registered tool classes

### Visible declarative tool

- `search_public_trial_form` makes the existing `/trials` search form agent-discoverable. The agent fills the same visible condition and open-record controls a person uses; no duplicate or hidden form exists.
- Agent activation is announced visibly, submit uses the same search function, and `SubmitEvent.respondWith()` returns bounded, structured source-linked results.

### Public imperative tools

- `trialbridge_method` explains the Taiwan-first method, privacy boundaries, sources, and limitations.
- `search_public_cancer_trials` searches public TFDA and ClinicalTrials.gov records by a non-sensitive cancer topic and returns the same visible bilingual registry query provenance as the human form. Its bounded output reports `complete`, `partial`, or `unavailable` coverage; completed sources include counts, elapsed milliseconds, query times, and live/fresh-cache/stale-cache snapshot state, while failed sources include a bounded code and latency. Cached, timed-out, or partial results therefore cannot appear live and complete.

### Intake-gated tools (visible switch at the note step)

- `organize_summary_form` makes the manual note form on `/match` agent-discoverable only while the person has switched on "Allow a WebMCP agent to add a de-identified summary". It never autosubmits: the agent fills the visible textarea and only the person's click starts organization. `SubmitEvent.respondWith()` returns the bounded outcome (`awaiting_confirmation`, `organizing`, or `failed`) with counts only.
- `organize_deidentified_summary` is the one imperative tool that changes page state, so its `readOnlyHint` is `false`. It exists only behind the same switch and only before any profile exists. It rejects text containing a direct identifier (email, phone, Taiwan ID, record number, labelled name, birth date, or address) before anything enters the page, naming the kinds to remove. Accepted text is appended to the visible note, masked in the browser, and organized by the same cloud step a person would start; the tool waits at most eight seconds and otherwise answers `organizing`. It never confirms a fact, matches, enrolls, or sends, and it disappears once organization starts.

### Sensitive contextual tools

- `review_trial_followups` reads the current registry-derived missing-question list and returns an actionable workflow state. It cannot record, infer, or confirm an answer.
- `explain_confirmed_matches` reads the current confirmed, de-identified comparison state.
- `draft_trial_outreach` creates an unsent outreach draft from a current match and confirmed summary.
- `draft_trial_discussion_brief` creates but never sends a bounded care-team brief from confirmed facts and current source-linked comparisons. It labels registry evidence, unknowns, and non-eligibility explicitly.
- `compare_shortlisted_trials` appears only after the person visibly selects two or three current result cards. It reads that shortlist and returns a compact public-record comparison; it accepts no trial IDs and cannot add, remove, reorder, or otherwise choose trials.

## Security invariants

- No tool returns raw medical-record text, uploaded documents, direct identifiers, model prompts, cookies, or server tokens, and the page never hands its note to an agent. The only tool that accepts medical context is the switch-gated intake tool; it takes a de-identified summary supplied by the agent, rejects direct identifiers before anything enters the page, and returns counts only.
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

Both visible declarative forms and all eight imperative tools import their names, descriptions, input schemas, and imperative annotations from `lib/webmcp/toolContractCore.ts`. Imperative human-facing `title` values follow the current English or Traditional Chinese page language, as recommended by the draft, while machine-facing names, descriptions, schemas, annotations, and authority remain stable. The derived catalog adds only explanatory metadata: registration style, availability, data boundary, human control, recovery, output trust, and measured Chrome guidance budgets. `/webmcp` renders that catalog as a searchable disclosure interface, while `/webmcp/contracts.json` exposes the same static no-health-data representation.

This eliminates a separate hand-maintained judge schema that could drift from runtime authority. It does not turn the catalog into a protocol endpoint or prove current-browser registration, tool selection, execution, cancellation, or cleanup.

The derived five-state capability model documents the registration boundary without medical data: public `2`, intake-permitted `3`, confirmed-but-locked `2`, permission-enabled `6`, and visible-shortlist `7`. Deterministic tests build the matching runtime context for each state and require exact name equality. The in-product simulator executes no tool; Chrome Inspector remains responsible for proving the corresponding transitions in a supported browser.

The separate explicit browser lifecycle suite uses one temporary `trialbridge_runtime_probe`, not a product capability. It is fixed, read-only, same-origin, no-network, and accepts only one diagnostic enum. The suite checks register/discover, metadata, bounded public-method execution, execution cancellation, `toolchange`, and registration cleanup, then requires the probe to be absent. Its receipt stores only check outcomes and remains runtime metadata rather than Inspector or clinical evidence.

## Verification target

`npm run verify:webmcp` statically checks both API styles, default runtime/catalog contract equality, page-language title localization with stable machine contracts, current Chrome name/description/parameter/output budgets, object-first/current-Chrome serialized execution compatibility, cancellation event compatibility, the six-check lifecycle definition, agent and visible-human execution-signal propagation, schemas, annotations, output caps, same-origin exposure, security headers, deprecated API absence, the eleven-case journey manifest, and freshness/privacy invariants for the recorded cloud-model selection artifact. Deterministic tests additionally verify probe cleanup after success and failure, exact abort-reason preservation, visible cancellation reaching the active fetch, completed-control removal, downstream adapter cancellation, and shared TFDA-load isolation. Chrome Model Context Tool Inspector must still confirm real discovery, manual calls, natural-language selection in Chrome, declarative form activation, sensitive consent behavior, agent cancellation, and tool cleanup.

The public `/webmcp/evidence.json` judge bundle mirrors the capability inventory and classifies each conformance claim as `repository_verified`, `recorded_model_eval`, or `manual_gate`. It contains evidence paths, primary links, audit metadata, and the full selection-dataset/tool-contract digests. It is static competition evidence: it reads no browser session, medical workflow state, note, profile, result, chat, prompt, argument, or output, and it does not extend the WebMCP protocol.
