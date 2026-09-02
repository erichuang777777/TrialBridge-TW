# WebMCP implementation and verification

## Concise judge route

`/webmcp/quickstart` is a three-minute, no-PHI entry point. It constructs the same two public imperative definitions as the product, registers them with an AbortSignal and `exposedTo: [location.origin]`, discovers only from the current origin, and checks `Permissions-Policy`, opener isolation, and MIME protection. Its only executable action is `trialbridge_method`: no input, ten-second cancellation cap, no model or registry request, no patient context, no workflow mutation, and no persistence. The resulting receipt is bounded and tab-local. Deterministic tests and `npm run verify:webmcp` cover this contract; current-browser interaction and Inspector selection remain separate acceptance boundaries.

## Agent discovery and Lighthouse evidence

`/llms.txt` follows the emerging llms.txt convention and points to `/webmcp/agent-guide.md`, quickstart, the visible public search, canonical contracts, and the competition bundle. The root layout advertises it with `rel="describedby"`. The guide derives all eight tool names from the canonical catalog and explains public, permission-gated, and shortlist-gated authority. Both resources accept no input and contain no workflow state or health information. They help agents find the runtime; they are not WebMCP protocol endpoints and cannot prove discovery or execution.

Chrome Lighthouse 13.4.1 Agentic Browsing was run with Chrome Stable 152 and the local `WebMCP` and `WebMCPTesting` features. `/webmcp/quickstart` exposed exactly the two public imperative tools; `/trials` exposed the one visible declarative tool. Both recorded category score 1, valid WebMCP schemas, a well-formed accessibility tree, `llms.txt` pass, and CLS 0. The first audit found an invalid `article[role=listitem]` override; replacing it with a native `ul`/`li` structure produced the passing rerun. `evals/webmcp-lighthouse-agentic-acceptance.json` stores only routes, tool names, states, versions, and evidence boundaries. Raw reports, page text, arguments, and outputs are not committed. Lighthouse's Agentic Browsing category is experimental and does not replace Inspector or clinical acceptance.

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

Changing profile, pending questions, matching state, results, consent, or visible language aborts the previous registration before registering the current tool set. English and Traditional Chinese pages expose localized human-facing titles while machine names, descriptions, schemas, annotations, and authority remain unchanged. Tools are exposed only to the current origin. Tool names are at most 30 characters and output is capped at 1,500 serialized characters, following Chrome's current security guidance. No tool accepts raw or masked medical text and there are no send, submit, enroll, book, consent, or treatment-change tools. Each imperative execution emits a visible payload-free lifecycle status.

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

## Recorded stock Inspector extension acceptance

The upstream [`model-context-tool-inspector`](https://github.com/beaufortfrancois/model-context-tool-inspector) was pinned at commit `f164a9aa5c3f6083f5976ccae308257bdf86cb99`, manifest version 1.9.14, without source changes. Because branded Chrome no longer supports command-line unpacked-extension loading, the isolated runs used Chrome for Testing Beta 153.0.8010.12 with `WebMCP` and `WebMCPTesting`, a new temporary profile, `/webmcp` for public discovery/execution, and `/match?demo=synthetic#private-chat` for the fictional permission transition.

The real stock extension background/content-script message path discovered exactly `search_public_cancer_trials` and `trialbridge_method`, serialized and parsed both schemas, observed the public read-only/untrusted-content hints, and manually invoked `trialbridge_method` with the fixed empty input. With a fictional confirmed profile visible, it then observed `2 → 2 → 6 → 2` tools as permission stayed off, turned on, and was revoked; the same four protected tool names were added and removed. Those three cases passed. The result is stored as metadata only in [`../evals/webmcp-inspector-extension-runtime.json`](../evals/webmcp-inspector-extension-runtime.json) and verified by `tests/webmcp-recorded-inspector-extension.test.ts` plus `npm run verify:webmcp`; no extension ID, raw descriptions, schemas, invocation inputs, execution result, prompts, or health information is retained.

The artifact is deliberately `partial`: Traditional Chinese selection, forbidden-request abstention, and cancellation/cleanup remain `not_run`. The stock natural-language mode requires a Gemini API key, so no key was configured and no natural-language provider call was made under TrialBridge's `gpt-oss:120b-cloud`-only policy. A pinned-source audit found that both manual and natural-language paths call `document.modelContext.executeTool` without an `AbortSignal`; the stock sidebar has no cancel control, its Reset action only clears chat/trace UI, and its `toolcancel` listener only logs an event. TrialBridge now separately exposes a visible human cancellation control while any WebMCP tool runs; it composes a page-owned abort signal with the agent signal, cancels unfinished executions on route/capability cleanup, and never exposes payload details. This repository-verified safety layer does not satisfy the agent-initiated Inspector case. Headless Chrome loaded the stock `sidebar.html` in an extension tab with the same target-tab query shim used by the upstream end-to-end test because opening a real side panel requires a user gesture. The run therefore proves the stock sidebar/background/content-script plumbing and local permission lifecycle, but not natural-language selection, stock agent cancellation/cleanup, production Origin Trial deployment, or clinical validity.

## Required manual Chrome gate

Before public release, use Chrome Model Context Tool Inspector to verify discovery, schemas, manual invocation, natural-language selection, untrusted-content annotations, consent-driven tool addition/removal, cancellation, output limits, and absence of sensitive tools after reset.

The `/webmcp` page standardizes this gate as six ordered checks: public discovery/schema parsing, safe method invocation, Traditional Chinese search selection, forbidden enrollment abstention, permission-driven capability changes, and cancellation/cleanup. Each item includes fixed setup/action/expected copy, and the two language-model cases use repository-owned no-PHI prompts. A reviewer may record `Pass` or `Needs attention` in volatile tab state and download a metadata-only receipt. That artifact is explicitly `manual_inspector_self_attestation`, `cryptographicallyVerified: false`, and contains only case IDs, outcomes, counts, origin, and Chrome major version—not prompts or tool payloads.

After downloading the runtime diagnostic and optional manual receipt, validate their structure against the current repository contract:

```bash
npm run verify:webmcp:receipts -- path/to/browser-diagnostic.json path/to/manual-inspector.json
```

The CLI requires runtime receipt schema `1.1` to show both public tools, all three security-header checks, a passed bounded public execution, and all six lifecycle outcomes including at least two `toolchange` events. It requires all six manual cases to pass, but deliberately reports that second artifact as manual self-attestation rather than Chrome-generated or cryptographic evidence.

This repository has unit, type, build, HTTP, cancellation-chain, and `npm run verify:webmcp` validation, plus eleven deterministic journey contracts. A separate no-PHI baseline sent those journeys to `gpt-oss:120b-cloud` five times and recorded 55/55 expected tool calls or safe abstentions in one uninterrupted run. Shortlist comparison passed 5/5 and all ten forbidden requests safely abstained. See [`WEBMCP_SELECTION_EVAL.md`](WEBMCP_SELECTION_EVAL.md). The cloud-model artifact, recorded browser lifecycle, and partial stock Inspector run cover three distinct boundaries—selection, browser execution, and extension plumbing—but none proves clinical quality, and three Inspector cases remain. The manual kit keeps that remaining gate reproducible.

## In-product evidence page

Open `/webmcp` to inspect the current browser without providing medical data. The page registers the two public imperative tools, queries same-origin discovery, checks the WebMCP Permissions Policy plus isolation and MIME headers, and exposes a six-check lifecycle acceptance suite when supported. A static provenance banner separately shows the recorded Chrome 153 6/6 result, exact browser version, cleanup state, console-error count, and receipt link without implying that the current viewer ran it. A compact adjacent disclosure states whether this build is local-testing only or token-configured-but-unverified, and keeps Chrome validation as a separate gate without exposing the token. Before the manual kit, a warning-toned partial banner reports the stock Inspector 3/6 result, three passed capabilities, three remaining checks, provider-policy boundary, pinned source, and no-PHI status in text rather than relying on color. A dated standards-alignment profile maps the visible declarative API, imperative API, lifecycle compatibility, and origin controls to the official draft and Chrome guidance. The implementation-landscape section remains source-reported ecosystem evidence, and the page also renders the recorded 55-sample selection baseline with its exact limits and artifact digests.

The five-stage critical-user-journey map follows Chrome's current [WebMCP user-journey framework](https://developer.chrome.com/docs/ai/webmcp/build-tools): each stage states the user goal, initial visible state, available capability, site reaction, and recovery path. Protected intake intentionally has no WebMCP tool. The explicit lifecycle action briefly registers `trialbridge_runtime_probe`, verifies same-origin discovery and fixed read-only metadata, executes only the bounded public method tool, propagates an execution AbortSignal, observes `toolchange`, aborts the registration, and requires the probe to disappear. The probe reads no page data, makes no network request, and accepts only one fixed cancellation mode. The diagnostic downloads browser state, header checks, six check IDs/outcomes, bounded event count, and cloud metadata only—never prompts, arguments, outputs, or health information. It does not substitute for Model Context Tool Inspector.

The adjacent judge conformance matrix is a separate static evidence layer. Seven rows are repository-verified, one row records the stock Inspector 3/6 browser result, one records the bounded 55-sample cloud-model selection evaluation, and one remains an explicit manual Inspector gate. Its summary additionally identifies the separate recorded 6/6 lifecycle artifact. `/webmcp/evidence.json` returns the same source-linked matrix, exact capability inventory, four-state tested registration model, lifecycle-suite definition, both recorded browser summaries, implementation-landscape metadata, and full artifact digests as public JSON. It does not read the current browser session; the preserved receipts are dated evidence from separate runs.

The **Live Agent Rehearsal** makes a narrow part of the recorded selection baseline reproducible in the product. A judge chooses one of four versioned synthetic journey IDs; there is no free-text field. The server sends the fixed prompt plus the tools available in that synthetic state to `gpt-oss:120b-cloud` through localhost Ollama, validates the returned name and arguments, and returns a volatile metadata-only receipt. Model prose, thinking, invented tool names, and argument values are never returned. The selection action itself never executes a capability. Cancellation reaches the provider request, the 30-second deadline is finite, and the endpoint shares the cloud probe's three-checks-per-ten-minutes bucket.

When the Traditional Chinese public-search scenario passes, the interface exposes a separate **Execute fixed public search** action. It discovers the already registered `search_public_cancer_trials` capability from the current origin and calls `document.modelContext.executeTool()` with exactly `{ condition: "胃癌" }`. The action accepts no authored input or patient context, requires read-only and untrusted-content annotations, stops after 25 seconds, propagates cancellation, and reduces the returned public content to a bounded volatile receipt containing the bilingual query bridge, source coverage, record count, and up to three titles. This is deliberately labelled site-orchestrated fixed-input browser evidence: it connects live model selection to a real public WebMCP execution path without claiming that Chrome Inspector or an external agent initiated the call.

The standards section also carries an eight-clause crosswalk pinned to upstream commit `41d12f057167ccf5954dbcf49d99502cb6c84491`. Seven imperative, lifecycle, permission, and annotation clauses are linked to implementation and verification evidence. The declarative row is deliberately labelled `explainer_aligned`: the upstream draft currently states that its Declarative WebMCP section is entirely TODO and points to the separate declarative explainer. TrialBridge TW therefore does not convert current Chrome markup behavior into a normative declarative-conformance claim.

The searchable Tool Contract Explorer is adjacent repository evidence. Its exact downloadable representation is `/webmcp/contracts.json`; it demonstrates that eight contracts are defined within the audited authority and size limits, while leaving real discovery and invocation to the runtime diagnostic and required Inspector gate.
