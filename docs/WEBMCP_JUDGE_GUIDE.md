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
| `search_public_cancer_trials` | Always | An agent can run a bounded TFDA and ClinicalTrials.gov search with source-linked structured output. |
| `explain_confirmed_matches` | Confirmed profile plus visible WebMCP permission | The tool follows live patient-confirmed page state and never receives the raw note. |
| `draft_trial_outreach` | Confirmed profile plus visible WebMCP permission | The agent can prepare an editable draft, but the product deliberately provides no send or enrollment capability. |

## In-product WebMCP Live proof

The collapsed **WebMCP Live** bar is always visible below the workflow heading. It reports the browser API lifecycle (`checking`, `registering`, `ready`, `unsupported`, or `error`) instead of silently swallowing registration failures. When ready, the count comes from `document.modelContext.getTools()`, filtered to TrialBridge TW's expected tools on the current origin.

Expand it to inspect public and confirmed-context tool names, permission-locked states, the read-only and untrusted-content boundary, and copyable Model Context Tool Inspector prompts. An unsupported browser receives setup guidance while the human workflow remains available as progressive enhancement.

The dedicated `/webmcp` competition-evidence page adds a current-browser diagnostic without entering medical data. It registers and discovers the two public imperative tools, verifies the three response-header controls, inventories all five WebMCP capabilities, and can execute only the non-sensitive `trialbridge_method` tool when `executeTool()` is available. It explicitly preserves the Inspector validation boundary.

## Why this is a strong WebMCP health-care example

1. **Progressive enhancement:** the full workflow remains usable by a person when WebMCP is unavailable.
2. **Two native WebMCP patterns:** the public form demonstrates visible declarative interaction, while stateful confirmed-context capabilities use typed imperative tools.
3. **Live context:** abortable registration makes the tool set track the current confirmed profile, results, permission, navigation, and reset state.
4. **Data minimization:** neither raw nor masked medical notes are part of any WebMCP schema or output.
5. **Untrusted evidence:** public registry results carry `untrustedContentHint`; read operations carry `readOnlyHint`.
6. **Bounded authority:** there are no send, submit, enroll, book, consent, or treatment-change tools.
7. **Human confirmation:** model-extracted facts remain drafts until the person corrects and confirms them in the visible page.

## Five-minute judge demonstration

1. Open `/webmcp`. Show the live browser-support state, two public tool discovery count, same-origin security headers, exact capability inventory, and zero write-authority summary. Run the safe method check when `executeTool()` is available.
2. Open `/trials`. Invoke `search_public_trial_form`; show the agent-filled condition, visible activation notice, normal results UI, and structured response from the same form submission.
3. Open the guided workflow. Expand **WebMCP Live** and show that the two public imperative tools are verified while the two confirmed-context tools are locked. Invoke `search_public_cancer_trials` and show source-linked bounded output.
4. Select **Try a synthetic case**. The fictional note still passes through the visible privacy notice, real browser masking, `gpt-oss:120b-cloud` extraction, human fact confirmation, pre-match questions, and public-registry matching. Show that confirmed-context tools remain locked while WebMCP permission is off.
5. Enable the visible WebMCP permission. Show `explain_confirmed_matches` and `draft_trial_outreach` changing to active without a reload; confirm the live count changes from 2/2 to 4/4.
6. Invoke the match explanation and point out confirmed facts, unresolved criteria, potential exclusion signals, and source traces.
7. Disable permission or reset the session. Show the sensitive tools being unregistered.
8. Ask the agent to enroll or send the outreach. Show that no such tool exists and the draft remains `sent: false`.

## Evaluation boundary

Automated tests and `npm run verify:webmcp` validate declarative markup, imperative definitions, schemas, context gating, output caps, clean-room constraints, builds, and HTTP behavior. Final origin-trial evaluation must also use Chrome Model Context Tool Inspector to verify both API styles, natural-language selection, manual execution, registration cleanup, and permission transitions in a supported browser.
