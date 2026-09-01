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

The dedicated `/webmcp` competition-evidence page adds a current-browser diagnostic without entering medical data. It registers and discovers the two public imperative tools, verifies the three response-header controls, inventories all eight WebMCP capabilities, and can execute only the non-sensitive `trialbridge_method` tool when `executeTool()` is available. It also shows a version-locked 55/55 cloud-model tool-selection baseline across direct, ambiguous, recovery, and forbidden intents. It explicitly preserves the Inspector validation boundary.

The page now begins with a responsive four-step judge runbook. Its bilingual-search step deep-links to `/trials?condition=胃癌`; the visible declarative form reads that public state, executes the same search, and keeps subsequent exact broad cancer aliases in the URL. Direct identifiers, multiline content, malformed conditions, and unrecognized detailed searches are removed rather than echoed into browser history; detailed pass-through search still runs without URL persistence.

Every imperative execution updates a payload-free status strip with the tool name and `running`, `completed`, `failed`, or `cancelled` recovery text. This makes agent activity visible without copying health content into telemetry or the DOM status message.

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

1. Open `/webmcp`. Show the live browser-support state, two public tool discovery count, same-origin security headers, exact capability inventory, 55-sample recorded selection baseline, and zero write-authority summary. Point out that the baseline is single-turn Ollama tool calling—not Inspector evidence. Run the safe method check when `executeTool()` is available.
2. Use the runbook's **Search 胃癌** link, which opens `/trials?condition=胃癌`. Show the visible query bridge sending `胃癌` to TFDA and `gastric cancer` to ClinicalTrials.gov, the shareable URL, normal results UI, and structured response from the same form submission. Then enter an unrecognized detailed term and show non-inferential pass-through.
3. Open the guided workflow. Expand **WebMCP Live** and show that the two public imperative tools are verified while four confirmed-context tools and the selection-dependent comparison tool are locked. Invoke `search_public_cancer_trials` and show source-linked bounded output, registry-level completion/failure status, and the visible execution status.
4. Select **Try a synthetic case**. The fictional note still passes through the visible privacy notice, real browser masking, `gpt-oss:120b-cloud` extraction, human fact confirmation, pre-match questions, and public-registry matching. Show that confirmed-context tools remain locked while WebMCP permission is off.
5. Enable the visible WebMCP permission. Show the four base confirmed-context tools changing to active without a reload; confirm the live count changes from 2/2 to 6/6 while comparison still says **Select 2 trials to activate**.
6. Add two result cards to the visible shortlist. Show the aligned desktop table or stacked mobile cards, then show `compare_shortlisted_trials` appear and the verified count change to 7/7. Invoke it and confirm the output contains only those human-selected trials and no trial-ID input parameter.
7. Before answering the visible follow-up form, invoke `review_trial_followups`. Show that it returns the pending questions and directs the person back to the visible form without accepting answers itself. Then invoke the match explanation and point out confirmed facts, unresolved criteria, potential exclusion signals, and source traces.
8. Remove one shortlist item, disable permission, or reset the session. Show the selection-dependent or all sensitive tools being unregistered, then download the payload-free session receipt and inspect the additions/removals without any medical content.
9. Create the local care-team discussion brief. Show the clinician-facing and plain-language sections, source links, explicit non-evidence statements, health-information warning, and `sent: false` boundary.
10. Ask the agent to enroll or send the outreach. Show that no such tool exists and both drafts remain `sent: false`.

## Evaluation boundary

Automated tests and `npm run verify:webmcp` validate declarative markup, imperative definitions, schemas, context gating, output caps, clean-room constraints, builds, HTTP behavior, and eleven deterministic journey expectations. A recorded `gpt-oss:120b-cloud` baseline adds 55 finite, synthetic single-turn selection samples; it is not a general model-accuracy or clinical claim. Final origin-trial evaluation must also use Chrome Model Context Tool Inspector to verify both API styles, natural-language selection, manual execution, registration cleanup, and permission transitions in a supported browser.
