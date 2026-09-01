# Why WebMCP is essential to TrialBridge TW

## One-sentence judge pitch

TrialBridge TW turns a human-facing clinical-trial website into a safe, structured capability layer that a browser agent can discover and use without guessing buttons, scraping medical text, or gaining enrollment authority.

## The WebMCP contribution

Clinical-trial navigation crosses a free-text story, structured medical facts, public registry records, unresolved criteria, and outreach preparation. Screen automation must repeatedly infer what a field or button means. TrialBridge TW instead exposes the existing visible registry form through declarative WebMCP and registers explicit contextual tools with JSON schemas through `document.modelContext.registerTool()`.

This is not a generic chatbot wrapper. WebMCP lets the site remain the authority for:

- which operations exist;
- which patient context is eligible to enter a tool;
- when a contextual tool appears or disappears;
- which sources and limitations accompany output; and
- which consequential operations do not exist.

## Live tools and what they prove

| Tool | Availability | Judge-visible value |
| --- | --- | --- |
| `search_public_trial_form` | On `/trials` | An agent can fill and submit the same visible public search form a person uses; activation and results remain visible. |
| `trialbridge_method` | Always | An agent can accurately explain Taiwan-first search, sources, privacy, and limits without reading the DOM. |
| `search_public_cancer_trials` | Always | An agent can run a bounded search and receive the same visible bilingual TFDA/ClinicalTrials.gov query plan, source-linked records, and explicit completed/failed registry status. |
| `review_trial_followups` | Confirmed profile plus visible WebMCP permission | The agent can identify the exact registry-derived questions still blocking comparison and receive a recovery step, but cannot record or confirm an answer. |
| `explain_confirmed_matches` | Confirmed profile plus visible WebMCP permission | The tool follows live patient-confirmed page state and never receives the raw note. |
| `draft_trial_outreach` | Confirmed profile plus visible WebMCP permission | The agent can prepare an editable draft, but the product deliberately provides no send or enrollment capability. |
| `draft_trial_discussion_brief` | Confirmed profile plus visible WebMCP permission | The agent can prepare a care-team brief that separates registry facts, uncertainty, possible exclusion signals, and discussion questions; it is never sent. |
| `compare_shortlisted_trials` | Permission plus 2–3 visible user selections | The agent can compare exactly the shortlist the person chose; it cannot supply trial IDs or alter that selection. |

## In-product WebMCP Live proof

The collapsed **WebMCP Live** bar is always visible below the workflow heading. It reports the browser API lifecycle (`checking`, `registering`, `ready`, `unsupported`, or `error`) instead of silently swallowing registration failures. When ready, the count comes from `document.modelContext.getTools()`, filtered to TrialBridge TW's expected tools on the current origin.

Expand it to inspect public and confirmed-context tool names, permission-locked states, the read-only and untrusted-content boundary, and copyable Model Context Tool Inspector prompts. An unsupported browser receives setup guidance while the human workflow remains available as progressive enhancement.

The dedicated `/webmcp` competition-evidence page adds a current-browser diagnostic without entering medical data. It registers and discovers the two public imperative tools, verifies the three response-header controls, inventories all eight WebMCP capabilities, and offers an explicit six-check lifecycle suite when `executeTool()` is available. The suite briefly registers one fixed read-only, no-network probe; verifies discovery, schema/hints, bounded public-method execution, execution cancellation, `toolchange`, and AbortSignal cleanup; then requires the probe to disappear before showing results. It also shows a dated standards-alignment profile for the declarative API, imperative API, current draft/Origin Trial compatibility boundary, and origin security, plus a version-locked 55/55 cloud-model tool-selection baseline across direct, ambiguous, recovery, and forbidden intents. A separate, dated implementation landscape links the upstream status for ChatGPT Desktop and Brave Leo plus Chrome's Origin Trial documentation. It is labelled source-reported evidence and never presented as a compatibility result for the current browser. A five-stage critical-user-journey map makes the goal, initial state, page reaction, and recovery path visible. The page's optional live cloud smoke test accepts no authored input and sends one fixed synthetic prompt through the localhost proxy, with visible cancel/retry controls and a 30-second deadline. The diagnostic can download a local no-health-data JSON receipt containing browser checks, lifecycle outcomes, and cloud-probe metadata, never tool or model content. Both surfaces explicitly preserve the Inspector validation boundary.

The **Canonical tool contracts** explorer lets a judge search or filter all eight capabilities and expand the exact description, JSON Schema, parameters, availability, security hints, human-control boundary, recovery behavior, and Chrome guidance measurements. Copy actions use the same canonical definitions imported by the runtime tools; `/webmcp/contracts.json` downloads the complete static catalog. This proves repository contract consistency and authority limits, not that the current browser discovered or executed a tool.

The adjacent **State-scoped capability simulator** answers the competition question “why WebMCP instead of one permanent chatbot API?” Four keyboard-operable synthetic states show the imperative tool count changing `2 → 2 → 6 → 7`. The unchanged second state proves that confirming facts does not silently grant agent access; visible permission adds the four contextual tools, and a second human-selected trial adds only shortlist comparison. Every state is tested against `buildTrialBridgeTools()`. The simulator makes no request and remains repository evidence rather than a live browser result.

The page also includes a compact nine-row judge conformance matrix. It prevents different evidence types from being blended into one green score: seven claims are repository-verified, the selection baseline is labelled recorded model evaluation, and natural-language browser selection remains a manual Inspector gate. A judge can download `/webmcp/evidence.json` to inspect the same capability inventory, evidence paths, source links, audit metadata, and full dataset/tool-contract digests. The static bundle contains no current browser or medical-workflow state and is explicitly not a protocol endpoint.

Directly below the live runtime diagnostic, the six-check **Manual Chrome gate** turns the remaining Inspector work into one repeatable acceptance path. It covers public discovery/schema parsing, safe invocation, Traditional Chinese tool selection, forbidden enrollment abstention, permission-driven registration changes, and cancellation/cleanup. Each outcome is explicitly reviewer-recorded. The downloadable JSON contains only case IDs, outcomes, counts, origin, and Chrome major version and says `selfAttested: true` plus `cryptographicallyVerified: false`; it never upgrades a manual checkbox into automatic Chrome evidence.

Before entering the demonstration, the optional **Demo preflight** runs the existing fixed cloud probe and a fixed `gastric cancer` query against TFDA and ClinicalTrials.gov in parallel. It accepts no request body, exposes cancel/retry, stops by 30 seconds, shares the cloud-probe allowance, and returns only requested/provider model labels, source counts, cache/live state, latency, and bounded failure codes. Trial records, model text, prompts, and health information are excluded. A partial result names the affected dependency and recovery; the preflight is operational readiness evidence, not WebMCP Inspector or clinical evidence.

The page now begins with a responsive four-step judge runbook. Its bilingual-search step deep-links to `/trials?condition=胃癌`; the visible declarative form reads that public state, executes the same search, and keeps subsequent exact broad cancer aliases in the URL. The protected-flow step deep-links to the fixed `/?demo=synthetic#private-chat` entry, preloads only the repository's fictional note, and stops at the visible privacy boundary. It cannot skip masking, cloud organization, confirmation, clarification, or matching. Direct identifiers, multiline content, malformed conditions, and unrecognized detailed searches are removed rather than echoed into browser history; patient-authored content is never accepted in the demo URL.

Every imperative execution updates a payload-free status strip with the tool name and `running`, `completed`, `failed`, or `cancelled` recovery text. This makes agent activity visible without copying health content into telemetry or the DOM status message. Cancellation is functional rather than cosmetic: the execution signal reaches the browser request, Next.js route, matching layer, and both public-registry adapters while retaining the caller's abort reason.

The expanded panel also keeps a bounded session capability receipt. It shows the latest six of at most 20 tab-local events, including verified tool additions/removals and execution states. A judge may explicitly download the JSON receipt; it excludes medical content, prompts, arguments, outputs, and detailed error text, and TrialBridge TW never uploads it.

## Why this is a strong WebMCP health-care example

1. **Progressive enhancement:** the full workflow remains usable by a person when WebMCP is unavailable.
2. **Two native WebMCP patterns:** the public form demonstrates visible declarative interaction, while stateful confirmed-context capabilities use typed imperative tools.
3. **Live context:** abortable registration makes the tool set track the current confirmed profile, results, permission, navigation, and reset state.
4. **Data minimization:** neither raw nor masked medical notes are part of any WebMCP schema or output.
5. **Untrusted evidence:** public registry results carry `untrustedContentHint`; read operations carry `readOnlyHint`.
6. **Bounded authority:** there are no send, submit, enroll, book, consent, or treatment-change tools.
7. **Human confirmation:** model-extracted facts remain drafts until the person corrects and confirms them in the visible page.

## Five-minute judge demonstration

1. Open `/webmcp`. Run the body-free Demo preflight and confirm cloud, TFDA, and ClinicalTrials.gov readiness or source-level recovery before entering the workflow. Then show the live browser-support state, two public tool discovery count, and same-origin security headers. Run **One-click WebMCP lifecycle acceptance** and expand its six outcomes; confirm the temporary probe is absent after cleanup, then download the no-health-data browser receipt. Continue with the five-stage critical user journey, exact capability inventory, source-reported implementation landscape, nine-row conformance matrix, 55-sample recorded selection baseline, and zero write-authority summary. In **Canonical tool contracts**, filter to permission-gated tools, expand one entry, compare its exact schema and hints, then download `/webmcp/contracts.json`. In **State-scoped capability simulator**, switch through all four states and point out the `2 → 2 → 6 → 7` sequence and the separate declarative form. Download the static judge bundle and show that it carries the tested state model, six-check suite definition, full digests, and `manual_gate`; catalog, simulator, preflight, lifecycle definition, ecosystem cards, and the single-turn Ollama baseline are not Inspector evidence. Run the isolated cloud smoke test when demonstrating its separate metadata receipt. Use the six-check Manual Chrome gate to run and record the actual Inspector outcomes; its receipt remains visibly self-attested.
2. Use the runbook's **Search 胃癌** link, which opens `/trials?condition=胃癌`. Show the visible query bridge sending `胃癌` to TFDA and `gastric cancer` to ClinicalTrials.gov, the shareable URL, normal results UI, and structured response from the same form submission. Then enter an unrecognized detailed term and show non-inferential pass-through.
3. Open the guided workflow. Expand **WebMCP Live** and show that the two public imperative tools are verified while four confirmed-context tools and the selection-dependent comparison tool are locked. Invoke `search_public_cancer_trials` and show source-linked bounded output, complete/partial/unavailable coverage, per-source latency, timeout/failure codes, explicit live/fresh-cache/stale-cache snapshot provenance, and the visible execution status.
4. Follow **Open synthetic workflow**. The fixed deep link prepares the fictional note at the visible privacy notice; it still passes through real browser masking, `gpt-oss:120b-cloud` extraction, human fact confirmation, pre-match questions, and public-registry matching. Show that confirmed-context tools remain locked while WebMCP permission is off.
   On the shared review surface, point out the volatile extraction receipt: requested and provider-reported model labels, localhost-proxy/remote-cloud transport, actual latency, and TrialBridge non-persistence are visible without storing the note or model response. If extraction fails, the same location shows a bounded code, elapsed time, and retry/edit recovery path.
5. Enable the visible WebMCP permission. Show the four base confirmed-context tools changing to active without a reload; confirm the live count changes from 2/2 to 6/6 while comparison still says **Select 2 trials to activate**.
6. Add two result cards to the visible shortlist. Show the aligned desktop table or stacked mobile cards, then show `compare_shortlisted_trials` appear and the verified count change to 7/7. Invoke it and confirm the output contains only those human-selected trials and no trial-ID input parameter.
7. Before answering the visible follow-up form, invoke `review_trial_followups`. Show that it returns the pending questions and directs the person back to the visible form without accepting answers itself. Then invoke the match explanation and point out confirmed facts, unresolved criteria, potential exclusion signals, and source traces.
8. Remove one shortlist item, disable permission, or reset the session. Show the selection-dependent or all sensitive tools being unregistered, then download the payload-free session receipt and inspect the additions/removals without any medical content.
9. Create the local care-team discussion brief. Show the clinician-facing and plain-language sections, source links, explicit non-evidence statements, health-information warning, and `sent: false` boundary.
10. Ask the agent to enroll or send the outreach. Show that no such tool exists and both drafts remain `sent: false`.

When Inspector cancellation is available, start a public registry search and cancel it while it is running. The visible state must change to `cancelled`, and deterministic repository tests prove the same signal aborts the downstream registry requests rather than only hiding the spinner. This manual step remains unclaimed until it is exercised in the supported browser.

## Evaluation boundary

Automated tests and `npm run verify:webmcp` validate declarative markup, imperative definitions, canonical contract equality, Chrome guidance budgets, schemas, context gating, output caps, clean-room constraints, builds, HTTP behavior, the bounded smoke-test contract, the lifecycle-suite state machine, and eleven deterministic journey expectations. `npm run verify:webmcp:receipts -- <runtime.json> [manual.json]` separately requires a complete six-check browser lifecycle receipt and validates its metadata-only structure without changing its evidence class. `npm run verify:cloud` is a separate explicit live request and is not automatically run by CI. A recorded `gpt-oss:120b-cloud` baseline adds 55 finite, synthetic single-turn selection samples; it is not a general model-accuracy or clinical claim. Neither the static suite definition, catalog, cloud probe, nor baseline proves clinical quality or Inspector behavior. Final origin-trial evaluation must also use Chrome Model Context Tool Inspector to verify both API styles, natural-language selection, manual execution, registration cleanup, and permission transitions in a supported browser.
