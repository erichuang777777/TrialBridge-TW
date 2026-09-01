# Why WebMCP is essential to TrialBridge TW

## One-sentence judge pitch

TrialBridge TW turns a human-facing clinical-trial website into a safe, structured capability layer that a browser agent can discover and use without guessing buttons, scraping medical text, or gaining enrollment authority.

## The WebMCP contribution

Clinical-trial navigation crosses a free-text story, structured medical facts, public registry records, unresolved criteria, and outreach preparation. Screen automation must repeatedly infer what a field or button means. TrialBridge TW instead registers explicit tools with JSON schemas and current page state through `document.modelContext.registerTool()`.

This is not a generic chatbot wrapper. WebMCP lets the site remain the authority for:

- which operations exist;
- which patient context is eligible to enter a tool;
- when a contextual tool appears or disappears;
- which sources and limitations accompany output; and
- which consequential operations do not exist.

## Live tools and what they prove

| Tool | Availability | Judge-visible value |
| --- | --- | --- |
| `trialbridge_method` | Always | An agent can accurately explain Taiwan-first search, sources, privacy, and limits without reading the DOM. |
| `search_public_cancer_trials` | Always | An agent can run a bounded TFDA and ClinicalTrials.gov search with source-linked structured output. |
| `explain_confirmed_matches` | Confirmed profile plus visible WebMCP permission | The tool follows live patient-confirmed page state and never receives the raw note. |
| `draft_trial_outreach` | Confirmed profile plus visible WebMCP permission | The agent can prepare an editable draft, but the product deliberately provides no send or enrollment capability. |

## In-product WebMCP Live proof

The collapsed **WebMCP Live** bar is always visible below the workflow heading. It reports the browser API lifecycle (`checking`, `registering`, `ready`, `unsupported`, or `error`) instead of silently swallowing registration failures. When ready, the count comes from `document.modelContext.getTools()`, filtered to TrialBridge TW's expected tools on the current origin.

Expand it to inspect public and confirmed-context tool names, permission-locked states, the read-only and untrusted-content boundary, and copyable Model Context Tool Inspector prompts. An unsupported browser receives setup guidance while the human workflow remains available as progressive enhancement.

## Why this is a strong WebMCP health-care example

1. **Progressive enhancement:** the full workflow remains usable by a person when WebMCP is unavailable.
2. **Discovery and schemas:** browser agents receive named, typed tools instead of reverse-engineering a complex UI.
3. **Live context:** abortable registration makes the tool set track the current confirmed profile, results, permission, navigation, and reset state.
4. **Data minimization:** neither raw nor masked medical notes are part of any WebMCP schema or output.
5. **Untrusted evidence:** public registry results carry `untrustedContentHint`; read operations carry `readOnlyHint`.
6. **Bounded authority:** there are no send, submit, enroll, book, consent, or treatment-change tools.
7. **Human confirmation:** model-extracted facts remain drafts until the patient or caregiver corrects and confirms them in the visible page.

## Five-minute judge demonstration

1. Open the page in a compatible Chrome build. Expand **WebMCP Live** and show that the two public tools are verified while the two confirmed-context tools are locked.
2. Invoke `search_public_cancer_trials` with a non-sensitive cancer topic. Show structured TFDA or ClinicalTrials.gov source links and bounded output.
3. Select **Try a synthetic case**. The fictional note still passes through the visible privacy notice, real browser masking, `gpt-oss:120b-cloud` extraction, human fact confirmation, pre-match questions, and public-registry matching. Show that confirmed-context tools remain locked while WebMCP permission is off.
4. Enable the visible WebMCP permission. Show `explain_confirmed_matches` and `draft_trial_outreach` changing to active without a reload; confirm the live count changes from 2/2 to 4/4.
5. Invoke the match explanation and point out confirmed facts, unresolved criteria, potential exclusion signals, and source traces.
6. Disable permission or reset the session. Show the sensitive tools being unregistered.
7. Ask the agent to enroll or send the outreach. Show that no such tool exists and the draft remains `sent: false`.

## Evaluation boundary

Automated tests validate tool definitions, schemas, context gating, output caps, clean-room constraints, builds, and HTTP behavior. Final origin-trial evaluation must also use Chrome Model Context Tool Inspector to verify discovery, natural-language selection, manual execution, registration cleanup, and permission transitions in a supported browser.
