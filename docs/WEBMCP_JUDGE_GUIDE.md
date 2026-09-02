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

If the browser does not expose `document.modelContext`, the bar says that the WebMCP preview is off or unsupported—not that the registry or matching API failed. Its disclosure explains that the human product remains available and provides a copyable `chrome://flags/#enable-webmcp-testing` setup address for local Chrome testing. An insecure context receives a separate HTTPS/localhost recovery message.

Expand it to inspect public and confirmed-context tool names, permission-locked states, the read-only and untrusted-content boundary, and copyable Model Context Tool Inspector prompts. An unsupported browser receives setup guidance while the human workflow remains available as progressive enhancement.

The dedicated `/webmcp` competition-evidence page adds a current-browser diagnostic without entering medical data. It registers and discovers the two public imperative tools, verifies the three response-header controls, inventories all eight WebMCP capabilities, and offers an explicit six-check lifecycle suite when `executeTool()` is available. The suite briefly registers one fixed read-only, no-network probe; verifies discovery, schema/hints, bounded public-method execution, execution cancellation, `toolchange`, and AbortSignal cleanup; then requires the probe to disappear before showing results. A separate server-rendered provenance banner shows the recorded Chrome for Testing 153.0.8010.12 result: 6/6 lifecycle checks, zero console errors, probe absent after cleanup, and only the two public tools remaining. It links to the exact no-PHI receipt and explicitly does not claim the current viewer, Inspector natural-language selection, or production Origin Trial deployment. A compact native disclosure directly below it labels this build `local_testing_only` or token-configured-but-unverified, explains server-rendered first-party delivery, and never renders the token in JSON. The page also shows standards alignment, the 55/55 cloud-model selection baseline, source-reported implementation landscape, critical-user-journey map, and an optional fixed cloud smoke test while preserving each evidence boundary.

The **Canonical tool contracts** explorer lets a judge search or filter all eight capabilities and expand the exact description, JSON Schema, parameters, availability, security hints, human-control boundary, recovery behavior, and Chrome guidance measurements. Copy actions use the same canonical definitions imported by the runtime tools; `/webmcp/contracts.json` downloads the complete static catalog. This proves repository contract consistency and authority limits, not that the current browser discovered or executed a tool.

The adjacent **State-scoped capability simulator** answers the competition question “why WebMCP instead of one permanent chatbot API?” Four keyboard-operable synthetic states show the imperative tool count changing `2 → 2 → 6 → 7`. The unchanged second state proves that confirming facts does not silently grant agent access; visible permission adds the four contextual tools, and a second human-selected trial adds only shortlist comparison. Every state is tested against `buildTrialBridgeTools()`. The simulator makes no request and remains repository evidence rather than a live browser result.

The page also includes a compact nine-row judge conformance matrix. It prevents different evidence types from being blended into one green score: seven claims are repository-verified, the recorded browser lifecycle is identified separately, the selection baseline is labelled recorded model evaluation, and natural-language browser selection remains a manual Inspector gate. A judge can download `/webmcp/evidence.json` to inspect the same capability inventory, evidence paths, source links, audit metadata, recorded runtime summary, and full dataset/tool-contract digests. The static bundle contains no current browser or medical-workflow state and is explicitly not a protocol endpoint.

Directly below the live runtime diagnostic, the six-check **Manual Chrome gate** turns the remaining Inspector work into one repeatable acceptance path. It covers public discovery/schema parsing, safe invocation, Traditional Chinese tool selection, forbidden enrollment abstention, permission-driven registration changes, and cancellation/cleanup. Each outcome is explicitly reviewer-recorded. The downloadable JSON contains only case IDs, outcomes, counts, origin, and Chrome major version and says `selfAttested: true` plus `cryptographicallyVerified: false`; it never upgrades a manual checkbox into automatic Chrome evidence.

Before entering the demonstration, the optional **Demo preflight** runs the existing fixed cloud probe and a fixed `gastric cancer` query against TFDA and ClinicalTrials.gov in parallel. It accepts no request body, exposes cancel/retry, stops by 30 seconds, shares the cloud-probe allowance, and returns only requested/provider model labels, source counts, cache/live state, latency, and bounded failure codes. Trial records, model text, prompts, and health information are excluded. A partial result names the affected dependency and recovery; the preflight is operational readiness evidence, not WebMCP Inspector or clinical evidence.

The page now begins with a responsive four-step judge runbook. Its bilingual-search step deep-links to `/trials?condition=胃癌&includeNotOpen=1`; the visible declarative form reads that public state, executes the same search, and keeps subsequent exact broad cancer aliases in the URL. Recruiting, closed, and status-unpublished records remain visibly filterable. The protected-flow step deep-links to the fixed `/match?demo=synthetic#private-chat` entry and preloads only the repository's fictional note. It cannot skip masking, cloud organization, confirmation, clarification, or matching. Direct identifiers, multiline content, malformed conditions, and unrecognized detailed searches are removed rather than echoed into browser history; patient-authored content is never accepted in the demo URL.

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

1. Open `/webmcp`. Start with the recorded-browser banner: Chrome for Testing 153.0.8010.12, 6/6 lifecycle checks, zero console errors, probe absent, and the exact receipt link. Expand **Origin Trial deployment** and point out the exact boundary: local testing or configured-but-unverified, token absent from JSON, and Chrome validation still required. Run the body-free Demo preflight and confirm cloud, TFDA, and ClinicalTrials.gov readiness or source-level recovery. Then show the current browser-support state, two public tool discovery count, and same-origin security headers. When supported, run **One-click WebMCP lifecycle acceptance**, expand its outcomes, confirm cleanup, and download the no-health-data current-browser receipt. Continue with the critical journey, capability inventory, conformance matrix, 55-sample selection baseline, canonical contracts, and 2 → 2 → 6 → 7 simulator. Keep the recorded runtime, deployment configuration, current-browser run, static evidence, cloud-model selection, and self-attested Manual Chrome gate visibly distinct.
2. Use the runbook's **Search 胃癌** link, which opens `/trials?condition=胃癌&includeNotOpen=1`. Show the visible query bridge sending `胃癌` to TFDA and `gastric cancer` to ClinicalTrials.gov, the shareable URL, status/phase/location filters, normal results UI, and structured response from the same form submission. Then enter an unrecognized detailed term and show non-inferential pass-through.
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

Automated tests and `npm run verify:webmcp` validate declarative markup, imperative definitions, canonical contract equality, Chrome guidance budgets, schemas, context gating, output caps, clean-room constraints, HTTP behavior, the lifecycle state machine, and the preserved Chrome 153 receipt. That recorded run proves 6/6 local browser API lifecycle checks and cleanup. `npm run verify:webmcp:receipts -- <runtime.json> [manual.json]` validates newly downloaded receipts separately. The 55-sample `gpt-oss:120b-cloud` artifact covers synthetic tool selection. None of these proves clinical quality, and final Origin Trial evaluation must still use Chrome Model Context Tool Inspector for natural-language selection and permission transitions.
