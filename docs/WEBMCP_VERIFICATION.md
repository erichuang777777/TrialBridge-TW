# WebMCP implementation and verification

## Registered tools

Visible on `/trials` through declarative WebMCP:

- `search_public_trial_form`: the existing public search form, with visible agent activation and same-path submission.

Always available on supporting browsers:

- `trialbridge_method`: product method and boundaries; read-only.
- `search_public_cancer_trials`: bounded TFDA and ClinicalTrials.gov search with the visible 19-group bilingual query plan; read-only and untrusted-content marked.

Registered only while the visible WebMCP consent checkbox is enabled and a confirmed profile exists:

- `review_trial_followups`: reads pending registry-derived questions and a recovery step; cannot accept or confirm answers.
- `explain_confirmed_matches`: current confirmed-profile explanations only.
- `draft_trial_outreach`: creates an unsent draft for a current match.
- `draft_trial_discussion_brief`: creates an unsent, source-traceable care-team brief with explicit uncertainty and no raw note.
- `compare_shortlisted_trials`: registered only after two or three current result cards are visibly selected; reads but cannot change that shortlist.

Changing profile, pending questions, matching state, results, or consent aborts the previous registration before registering the current tool set. Tools are exposed only to the current origin. Tool names are at most 30 characters and output is capped at 1,500 serialized characters, following Chrome's current security guidance. No tool accepts raw or masked medical text and there are no send, submit, enroll, book, consent, or treatment-change tools. Each imperative execution emits a visible payload-free lifecycle status.

## Canonical contract catalog

`lib/webmcp/toolContractCore.ts` is the shared source for the visible declarative form and all seven imperative runtime definitions. `lib/webmcp/toolContractCatalog.ts` adds availability, authority, human-control, recovery, output-trust, and measured-budget metadata without changing execution. The `/webmcp` Tool Contract Explorer derives from that catalog, and force-static `/webmcp/contracts.json` exposes the same eight entries for offline review. Tests compare each built runtime tool against the canonical description, schema, and annotations, require `additionalProperties: false`, enforce the current character/output guidance, and reject write-like authority.

The JSON artifact is implementation evidence only. It contains no current-browser result, request, workflow state, note, profile, trial result, prompt, argument, output, or health information, and it does not claim protocol metadata or Inspector completion.

## State-scoped registration model

`lib/webmcp/capabilityStates.ts` derives public, permission-gated, and shortlist-dependent names from the canonical catalog, then defines four synthetic human states. `tests/webmcp-capability-states.test.ts` constructs each equivalent runtime context and requires exact tool-name equality with `buildTrialBridgeTools()`: two public tools, still two after confirmation with permission off, six with visible permission, and seven after two visible shortlist selections. The `/webmcp` simulator exposes this as an accessible button group and one atomic status sentence.

The model contains tool names and public boundary copy only. It executes no tool, reads no browser or medical workflow state, persists nothing, and remains distinct from the runtime diagnostic and manual Inspector gate.

## Draft and Origin Trial compatibility

The upstream WebMCP draft and Chrome's current Origin Trial do not yet expose an identical execution boundary. The draft accepts an object in `executeTool()`, while the current Chromium implementation accepts a serialized JSON string. TrialBridge's safe public-method diagnostic and fixed public-search proof try the draft object form first and retry the identical serialized object only after a `TypeError` indicates an input-shape mismatch. An ordinary tool, registry, timeout, or cancellation failure is never retried as a second execution. The dedicated lifecycle probe follows the current Chrome string form first, then falls back to the draft object form. Every compatibility path is restricted to fixed read-only tools.

Declarative cancellation has the same temporary naming difference. TrialBridge listens for the upstream `toolcanceled` event and Chromium's current `toolcancel` event; both clear the same visible form-active state.

Imperative lifecycle handling follows the upstream separation between registration and execution. The registration `AbortSignal` unregisters the exposed tools while preserving work already in flight. Every execution callback separately receives a signal that TrialBridge passes through browser fetch, `request.signal`, matching, the registry coordinator, and each adapter. Unit tests assert that the exact caller abort reason reaches the WebMCP execution and both registry adapters. A cancelled TFDA caller stops waiting immediately, while the shared single-flight snapshot may finish for another caller instead of being destroyed by the first cancellation.

## Origin trial

For local testing, use a compatible Chrome build and its WebMCP testing flag; the default deployment state is explicitly `local_testing_only` and emits no token.

WebMCP itself is not a Chrome extension. `/webmcp` exposes one canonical setup contract and a copyable flag address, separating the specification, Chrome's native preview, and TrialBridge's automatic tool registration. Model Context Tool Inspector is a separate optional developer/judge utility. The same contract is embedded in `/webmcp/evidence.json`, declares `visitorInstallRequired: false`, reads no browser or workflow state, and executes no tool.

For a first-party production Origin Trial build, set the exact non-loopback HTTPS `SITE_URL` and its registered `WEBMCP_ORIGIN_TRIAL_TOKEN`. `lib/webmcp/originTrial.ts` rejects copied whitespace, malformed token shape, loopback origins, HTTP origins, and path-bearing origins. The server-rendered root layout emits the token as `<meta http-equiv="origin-trial">` before WebMCP code runs, following Chrome's supported first-party delivery method. The value is intentionally public browser markup, but it is not bundled through a `NEXT_PUBLIC_` variable and never appears in health or competition JSON.

Passing configuration is reported only as `configured_unverified`. It does not establish origin match, expiry, trial availability, usage limits, or browser support. Confirm the token status and registered origin in Chrome DevTools, then complete the separate Model Context Tool Inspector gate. `/api/health` reports only the bounded state, delivery method, and whether browser validation remains required; malformed production configuration degrades health and fails the build rather than silently emitting a questionable token.

## Recorded Chrome runtime acceptance

On 2026-09-02, the no-PHI lifecycle suite was run against `http://localhost:3001/webmcp` in an isolated Chrome for Testing Beta 153.0.8010.12 profile with the local `WebMCP` and `WebMCPTesting` features enabled. The page was a secure localhost context and returned the required `tools=(self)`, opener-isolation, and MIME-protection headers.

All six checks passed: registration/discovery, serialized schema plus read-only hints, bounded `trialbridge_method` execution, callback AbortSignal propagation, two `toolchange` events, and AbortSignal registration cleanup. The run ended with zero console errors, no `trialbridge_runtime_probe`, and exactly `search_public_cancer_trials` plus `trialbridge_method`. The downloaded schema-1.1 receipt is preserved as [`../evals/webmcp-browser-runtime-acceptance.json`](../evals/webmcp-browser-runtime-acceptance.json) and is validated by `npm run verify:webmcp` and `tests/webmcp-recorded-browser-runtime.test.ts`.

This recorded result is local browser-runtime metadata. It does not claim a production Origin Trial token, natural-language selection in Model Context Tool Inspector, permission-transition acceptance, or clinical validation.

## Required manual Chrome gate

Before public release, use Chrome Model Context Tool Inspector to verify discovery, schemas, manual invocation, natural-language selection, untrusted-content annotations, consent-driven tool addition/removal, cancellation, output limits, and absence of sensitive tools after reset.

The `/webmcp` page standardizes this gate as six ordered checks: public discovery/schema parsing, safe method invocation, Traditional Chinese search selection, forbidden enrollment abstention, permission-driven capability changes, and cancellation/cleanup. Each item includes fixed setup/action/expected copy, and the two language-model cases use repository-owned no-PHI prompts. A reviewer may record `Pass` or `Needs attention` in volatile tab state and download a metadata-only receipt. That artifact is explicitly `manual_inspector_self_attestation`, `cryptographicallyVerified: false`, and contains only case IDs, outcomes, counts, origin, and Chrome major version—not prompts or tool payloads.

After downloading the runtime diagnostic and optional manual receipt, validate their structure against the current repository contract:

```bash
npm run verify:webmcp:receipts -- path/to/browser-diagnostic.json path/to/manual-inspector.json
```

The CLI requires runtime receipt schema `1.1` to show both public tools, all three security-header checks, a passed bounded public execution, and all six lifecycle outcomes including at least two `toolchange` events. It requires all six manual cases to pass, but deliberately reports that second artifact as manual self-attestation rather than Chrome-generated or cryptographic evidence.

This repository has unit, type, build, HTTP, cancellation-chain, and `npm run verify:webmcp` validation, plus eleven deterministic journey contracts. A separate no-PHI baseline sent those journeys to `gpt-oss:120b-cloud` five times and recorded 55/55 expected tool calls or safe abstentions in one uninterrupted run. Shortlist comparison passed 5/5 and all ten forbidden requests safely abstained. See [`WEBMCP_SELECTION_EVAL.md`](WEBMCP_SELECTION_EVAL.md). The cloud-model artifact and recorded Chrome runtime now cover two distinct boundaries—selection and browser execution—but neither proves natural-language Inspector acceptance or clinical quality. The manual kit keeps that remaining gate reproducible.

## In-product evidence page

Open `/webmcp` to inspect the current browser without providing medical data. The page registers the two public imperative tools, queries same-origin discovery, checks the WebMCP Permissions Policy plus isolation and MIME headers, and exposes a six-check lifecycle acceptance suite when supported. A static provenance banner separately shows the recorded Chrome 153 6/6 result, exact browser version, cleanup state, console-error count, and receipt link without implying that the current viewer ran it. A compact adjacent disclosure states whether this build is local-testing only or token-configured-but-unverified, and keeps Chrome validation as a separate gate without exposing the token. A dated standards-alignment profile maps the visible declarative API, imperative API, lifecycle compatibility, and origin controls to the official draft and Chrome guidance. The implementation-landscape section remains source-reported ecosystem evidence, and the page also renders the recorded 55-sample selection baseline with its exact limits and artifact digests.

The five-stage critical-user-journey map follows Chrome's current [WebMCP user-journey framework](https://developer.chrome.com/docs/ai/webmcp/build-tools): each stage states the user goal, initial visible state, available capability, site reaction, and recovery path. Protected intake intentionally has no WebMCP tool. The explicit lifecycle action briefly registers `trialbridge_runtime_probe`, verifies same-origin discovery and fixed read-only metadata, executes only the bounded public method tool, propagates an execution AbortSignal, observes `toolchange`, aborts the registration, and requires the probe to disappear. The probe reads no page data, makes no network request, and accepts only one fixed cancellation mode. The diagnostic downloads browser state, header checks, six check IDs/outcomes, bounded event count, and cloud metadata only—never prompts, arguments, outputs, or health information. It does not substitute for Model Context Tool Inspector.

The adjacent judge conformance matrix is a separate static evidence layer. Seven rows are repository-verified, one row records the bounded 55-sample cloud-model selection evaluation, and one row remains an explicit manual Inspector gate. Its summary additionally identifies the recorded 6/6 browser-runtime artifact. `/webmcp/evidence.json` returns the same source-linked matrix, exact capability inventory, four-state tested registration model, lifecycle-suite definition, recorded browser summary, implementation-landscape metadata, and full artifact digests as public JSON. It does not read the current browser session; the preserved receipt is dated evidence from a separate run.

The **Live Agent Rehearsal** makes a narrow part of the recorded selection baseline reproducible in the product. A judge chooses one of four versioned synthetic journey IDs; there is no free-text field. The server sends the fixed prompt plus the tools available in that synthetic state to `gpt-oss:120b-cloud` through localhost Ollama, validates the returned name and arguments, and returns a volatile metadata-only receipt. Model prose, thinking, invented tool names, and argument values are never returned. The selection action itself never executes a capability. Cancellation reaches the provider request, the 30-second deadline is finite, and the endpoint shares the cloud probe's three-checks-per-ten-minutes bucket.

When the Traditional Chinese public-search scenario passes, the interface exposes a separate **Execute fixed public search** action. It discovers the already registered `search_public_cancer_trials` capability from the current origin and calls `document.modelContext.executeTool()` with exactly `{ condition: "胃癌" }`. The action accepts no authored input or patient context, requires read-only and untrusted-content annotations, stops after 25 seconds, propagates cancellation, and reduces the returned public content to a bounded volatile receipt containing the bilingual query bridge, source coverage, record count, and up to three titles. This is deliberately labelled site-orchestrated fixed-input browser evidence: it connects live model selection to a real public WebMCP execution path without claiming that Chrome Inspector or an external agent initiated the call.

The standards section also carries an eight-clause crosswalk pinned to upstream commit `41d12f057167ccf5954dbcf49d99502cb6c84491`. Seven imperative, lifecycle, permission, and annotation clauses are linked to implementation and verification evidence. The declarative row is deliberately labelled `explainer_aligned`: the upstream draft currently states that its Declarative WebMCP section is entirely TODO and points to the separate declarative explainer. TrialBridge TW therefore does not convert current Chrome markup behavior into a normative declarative-conformance claim.

The searchable Tool Contract Explorer is adjacent repository evidence. Its exact downloadable representation is `/webmcp/contracts.json`; it demonstrates that eight contracts are defined within the audited authority and size limits, while leaving real discovery and invocation to the runtime diagnostic and required Inspector gate.
