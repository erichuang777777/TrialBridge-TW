# TrialBridge TW design system

## Direction

A calm, minimal public-health interface: structured like Swiss editorial design, softened for patients and caregivers. Trust comes from clarity, provenance, and user control rather than decorative medical imagery.

## Tokens

| Role | Value |
| --- | --- |
| Primary ink | `#14343B` |
| Secondary ink | `#47636A` |
| Canvas | `#F6FBFA` |
| Surface | `#FFFFFF` |
| Action | `#086F78` |
| Action strong | `#075B63` |
| Support mint | `#D9F1EB` |
| Border | `#C8DEDB` |
| Focus | `#B45309` |
| Warning surface | `#FFF5EE` |

Use a system font stack led by Atkinson Hyperlegible, Noto Sans TC, PingFang TC, and Microsoft JhengHei. Do not make external font requests on the medical intake surface.

## Interaction rules

- Minimum interactive target: 44 by 44 CSS pixels.
- Text and controls meet WCAG AA contrast; focus rings are always visible.
- Motion is optional, subtle, and removed under `prefers-reduced-motion`.
- Never encode match status by color alone.
- Plain-language summaries lead; registry facts and eligibility criteria remain inspectable.
- A generated statement must visually distinguish source fact, model interpretation, and patient confirmation.
- The primary product shell uses three coordinated regions on desktop: a compact progress rail, the active review/work area, and a persistent right-side assistant.
- The first choice is Agent mode or Manual mode. Agent mode uses chat as the workflow controller; Manual mode exposes direct note, extraction, and confirmation controls. Switching modes preserves the shared intake note.
- Patient/caregiver identity is not an intake step or Agent question. The same workflow serves both, with a neutral internal default used only for schema compatibility.
- Agent-filled declarative forms are never hidden duplicates: the agent uses the visible human form, the active form receives a strong focus treatment, and activation is announced in a nearby status message.
- Public registry search displays the bilingual query plan before source receipts. Each registry term has an explicit registry label; mapped versus pass-through state uses text plus color, and the two-column plan stacks without horizontal scrolling on small screens.
- A submitted exact broad cancer alias is reflected in a shareable `/trials?condition=...` URL. Deep links reject direct identifiers, multiline content, and detailed or unrecognized terms; those searches can still run but are not written to history. The deep link uses the same visible declarative WebMCP form rather than a hidden route.
- Masked note and extracted facts share one review surface. `Confirmed` is a column heading, `Confirm all` sits beside it, and row checkboxes use accessible names without repeated visible labels.
- Treatment, timing, subtype, stage, disease extent, and biomarker facts receive visible model-review-priority prompts. These prompts never claim an objective probability of correctness.
- Trial cards show patient-confirmed disease, subtype, stage, biomarker, and age separately from the registry comparison matrix.
- Shortlisting is an explicit human action, capped at three cards. Two selections open an aligned desktop table; smaller screens receive equivalent stacked cards instead of page-wide horizontal overflow. Selection state is always announced as text, never color alone.
- A care-team discussion brief is a secondary result action, not a competing primary workflow step. Preview precedes download; the file warning names confirmed health information and local storage risk, while completion uses one atomic status message.
- Repeated comparison cells are color blocks with criterion, state, and rationale disclosed on pointer hover and keyboard focus. A visible legend and expanded text preserve non-color access.
- The WebMCP capability layer has one compact, collapsible live-status surface. Its atomic status sentence reports browser support and verified registration; tool names, permission locks, safety boundaries, and judge prompts appear only on disclosure.
- The disclosed WebMCP session receipt is a compact metadata timeline, not a second live region. It shows UTC time and plain-text lifecycle changes, retains at most 20 events, stacks on small screens, and gives its explicit local JSON download a clear disabled and completion state.
- Outside the medical workflow, `/webmcp` may provide a dedicated competition-evidence dashboard. It leads with a single contextual status, uses text plus color for every check, progressively discloses execution output, and never requests medical context.
- The competition dashboard starts with a four-step judge runbook. Numbered cards remain equal-height on desktop, stack to two then one column, and explicitly label the manual Chrome Inspector boundary.
- The WebMCP critical-user-journey map states the user goal, initial state, capability, visible UI reaction, and recovery at every stage. It uses a wrapping two-column card sequence rather than a horizontally scrolling timeline.
- Browser diagnostic evidence is download-only JSON with an adjacent atomic completion message. It contains runtime metadata only and never includes prompts, arguments, outputs, or health information.
- Live provider availability is an explicit judge action, never an automatic page-load request. It uses fixed synthetic content, one atomic status, an aria-hidden elapsed countdown, a visible cancel/retry control, and a finite deadline; receipts retain metadata only.
- The runbook's synthetic workflow uses a fixed `?demo=synthetic` deep link with no authored health content. It prepares the fictional note at the privacy boundary, announces that state in-page, and never bypasses masking, organization, confirmation, clarification, or matching. Clearing the anonymous conversation removes the fixed demo parameter.
- Social preview imagery uses the same calm editorial tokens and verified capability facts. It contains no patient imagery, testimonials, outcome claims, or remotely fetched fonts.

## Prohibited patterns

- No testimonials, urgency marketing, success-rate claims, carousels, glass effects, or decorative stock-medical imagery.
- No emoji as interface icons.
- No dark patterns around consent or cloud-model use.
- No interface statement that a person is eligible, that a trial will help, or that research participation should replace established care.
