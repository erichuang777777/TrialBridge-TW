# Why WebMCP is essential to TrialBridge TW

## Three-minute entrance

Open `/webmcp/quickstart` first. It keeps the judging path deliberately flat: confirm the current browser exposes `document.modelContext`, discover the two same-origin public tools, verify all three security headers, and explicitly run the fixed read-only `trialbridge_method`. The action has a ten-second cap, accepts no input, does not call the cloud model or trial registries, reads no patient context, changes no workflow state, and retains no result beyond the tab.

The next three cards link to the visible public `胃癌` search, the protected fictional workflow, and the full `/webmcp` evidence lab. This route proves current-browser discovery plus one safe method only. Recorded lifecycle evidence, model selection, registry execution, Origin Trial deployment, Inspector natural-language selection, and clinical validity remain separate gates.

The green strip below the live console is recorded local Lighthouse evidence, not the current viewer's result. Chrome Lighthouse 13.4.1 Agentic Browsing scored both `/webmcp/quickstart` and `/trials` at 1.00: accessibility trees and WebMCP schemas passed, `llms.txt` passed, CLS was zero, the quick route exposed two imperative tools, and the database exposed one declarative tool. The linked metadata omits page text, arguments, outputs, and health information. Chrome's audit remains experimental and does not replace Inspector natural-language selection.

Agents that arrive outside the judge route can start at `/llms.txt`, follow `/webmcp/agent-guide.md`, then discover only the runtime tools exposed by the current page. These resources document tool order and authority; they do not register or execute tools and are not alternate protocol endpoints.

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

The competition page now begins with a three-layer browser setup card: the upstream specification is documentation and installs nothing; Chrome local testing enables one native flag and relaunches; TrialBridge then registers tools automatically. Model Context Tool Inspector is explicitly separate and optional for visitors—it is installed only when a developer or judge needs the manual Inspector gate.

Expand it to inspect public and confirmed-context tool names, permission-locked states, the read-only and untrusted-content boundary, and copyable Model Context Tool Inspector prompts. An unsupported browser receives setup guidance while the human workflow remains available as progressive enhancement.

The dedicated `/webmcp` competition-evidence page adds a current-browser diagnostic without entering medical data. It registers and discovers the two public imperative tools, verifies the three response-header controls, inventories all eight WebMCP capabilities, and offers an explicit six-check lifecycle suite when `executeTool()` is available. The suite briefly registers one fixed read-only, no-network probe; verifies discovery, schema/hints, bounded public-method execution, execution cancellation, `toolchange`, and AbortSignal cleanup; then requires the probe to disappear before showing results. A separate server-rendered provenance banner shows the recorded Chrome for Testing 153.0.8010.12 result: 6/6 lifecycle checks, zero console errors, probe absent after cleanup, and only the two public tools remaining. It links to the exact no-PHI receipt and explicitly does not claim the current viewer, Inspector natural-language selection, or production Origin Trial deployment. A compact native disclosure directly below it labels this build `local_testing_only` or token-configured-but-unverified, explains server-rendered first-party delivery, and never renders the token in JSON. A second warning-toned banner records the unmodified stock Inspector 1.9.14 result separately: 3/6 checks passed through its real background/content-script/sidebar path—public discovery/schema parsing, fixed safe execution, and the fictional `2 → 2 → 6 → 2` permission lifecycle. The two natural-language cases and cancellation/cleanup remain not run; the stock Gemini-backed path was not invoked under the `gpt-oss:120b-cloud`-only policy. The page also shows standards alignment, the 55/55 cloud-model selection baseline, source-reported implementation landscape, critical-user-journey map, and an optional fixed cloud smoke test while preserving each evidence boundary.

The **Canonical tool contracts** explorer lets a judge search or filter all eight capabilities and expand the exact description, JSON Schema, parameters, availability, security hints, human-control boundary, recovery behavior, and Chrome guidance measurements. Copy actions use the same canonical definitions imported by the runtime tools; `/webmcp/contracts.json` downloads the complete static catalog. This proves repository contract consistency and authority limits, not that the current browser discovered or executed a tool.

The adjacent **State-scoped capability simulator** answers the competition question “why WebMCP instead of one permanent chatbot API?” Four keyboard-operable synthetic states show the imperative tool count changing `2 → 2 → 6 → 7`. The unchanged second state proves that confirming facts does not silently grant agent access; visible permission adds the four contextual tools, and a second human-selected trial adds only shortlist comparison. Every state is tested against `buildTrialBridgeTools()`. The simulator makes no request and remains repository evidence rather than a live browser result.

The page also includes a compact ten-row judge conformance matrix. It prevents different evidence types from being blended into one green score: seven claims are repository-verified, the stock Inspector 3/6 result is labelled recorded browser runtime, the selection baseline is labelled recorded model evaluation, and three Inspector cases remain a manual gate. A judge can download `/webmcp/evidence.json` to inspect the same capability inventory, evidence paths, source links, audit metadata, recorded runtime summaries, and full dataset/tool-contract digests. The static bundle contains no current browser or medical-workflow state and is explicitly not a protocol endpoint.

Above that matrix, expand **Upstream specification crosswalk**. It maps eight exact draft clauses to code and verification paths. Seven rows are implemented; the declarative form row is intentionally `explainer-aligned` because the upstream draft marks that section TODO. This distinction is part of the evidence, not a missing green badge.

Directly below the live runtime diagnostic, the recorded stock-Inspector banner states which two checks have hard runtime evidence and which four remain. The following six-check **Manual Chrome gate** preserves the complete repeatable acceptance path: public discovery/schema parsing, safe invocation, Traditional Chinese tool selection, forbidden enrollment abstention, permission-driven registration changes, and cancellation/cleanup. Each outcome is explicitly reviewer-recorded. The downloadable JSON contains only case IDs, outcomes, counts, origin, and Chrome major version and says `selfAttested: true` plus `cryptographicallyVerified: false`; it never upgrades a manual checkbox into automatic Chrome evidence.

Before entering the demonstration, the optional **Demo preflight** runs the existing fixed cloud probe and a fixed `gastric cancer` query against TFDA and ClinicalTrials.gov in parallel. It accepts no request body, exposes cancel/retry, stops by 30 seconds, shares the cloud-probe allowance, and returns only requested/provider model labels, source counts, cache/live state, latency, and bounded failure codes. Trial records, model text, prompts, and health information are excluded. A partial result names the affected dependency and recovery; the preflight is operational readiness evidence, not WebMCP Inspector or clinical evidence.

Immediately below it, **Live Agent Rehearsal** closes the gap between a static schema and a visible model decision without pretending to be a browser run. Choose one of four fixed no-PHI tasks: explain the method, select bilingual public search for a Traditional Chinese request, compare the synthetic visible shortlist, or abstain from an enrollment command. The page shows the fixed prompt, synthetic capability state, expected boundary, selected capability, schema check, model label, latency, and explicit `Tool execution: None`. It accepts no authored text, shares the preflight cloud allowance, supports cancellation, stores no response prose or thinking, and does not replace the Inspector gate. After the Traditional Chinese search passes, a separately labelled second action may execute only the fixed `胃癌` public search through the current browser and show a bounded source receipt; forbidden and contextual scenarios never expose that action.

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

## Three-minute entrance and full evidence demonstration

1. Open `/webmcp/quickstart`. Confirm the current-browser state, the two public-tool count, the three independent security headers, and the recorded 2/2 Agentic Browsing strip. Run only the fixed safe method when the native API is available. Follow the `胃癌` link to the same visible declarative form and point out the bilingual query plan, then open the protected fictional workflow to show that WebMCP cannot skip masking, confirmation, or permission. Continue to `/webmcp` only for the technical appendix. Start there with the recorded-browser banner: Chrome for Testing 153.0.8010.12, 6/6 lifecycle checks, zero console errors, probe absent, and the exact receipt link. Expand **Origin Trial deployment** and preserve the configured-but-unverified boundary. Run the body-free Demo preflight, then the fixed Traditional Chinese search and forbidden-enrollment scenarios in **Live Agent Rehearsal**. Keep recorded Lighthouse observation, recorded runtime, model selection, site-orchestrated fixed execution, deployment configuration, current-browser diagnostics, static evidence, and the self-attested Manual Chrome gate visibly distinct.
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

Automated tests and `npm run verify:webmcp` validate declarative markup, imperative definitions, canonical contract equality, Chrome guidance budgets, schemas, context gating, output caps, clean-room constraints, HTTP behavior, the lifecycle state machine, and the preserved Chrome 153 receipt. That recorded run proves 6/6 local browser API lifecycle checks and cleanup, while the separate stock Inspector artifact proves one fictional local permission transition. `npm run verify:webmcp:receipts -- <runtime.json> [manual.json]` validates newly downloaded receipts separately. The 55-sample `gpt-oss:120b-cloud` artifact covers synthetic tool selection. None of these proves clinical quality, and final Origin Trial evaluation must still use Chrome Model Context Tool Inspector for natural-language selection, cancellation/cleanup, and production revalidation.
