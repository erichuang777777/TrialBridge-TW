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
- The primary product shell uses two coordinated regions on desktop: one active review/work area and a persistent right-side assistant. A compact horizontal Describe / Review / Compare indicator replaces the progress rail.
- Agent mode or Manual mode is a compact segmented control rather than a standalone screen-sized choice. Agent mode uses chat as the workflow controller; Manual mode exposes direct note, extraction, and confirmation controls. Switching modes preserves the shared intake note.
- The homepage may use one abstract Three.js eligibility constellation to explain patient facts to criteria to trials. It contains no health information, never competes with text, pauses off-screen, and falls back to static SVG for reduced motion, compact, data-saving, or low-memory contexts.
- The landing page and protected workspace are separate routes. `/` explains hope, purpose, Taiwan-first scope, and public WebMCP discovery above the fold; its primary action navigates to `/match` instead of scrolling. `/match` contains the protected Describe / Review / Compare workflow and is not indexed.
- The landing page mounts the public WebMCP capability layer. An arriving agent can call `trialbridge_method` first and `search_public_cancer_trials` without health context; contextual tools remain absent until the visible `/match` workflow has a confirmed profile and explicit permission.
- Patient/caregiver identity is not an intake step or Agent question. The same workflow serves both, with a neutral internal default used only for schema compatibility.
- Agent-filled declarative forms are never hidden duplicates: the agent uses the visible human form, the active form receives a strong focus treatment, and activation is announced in a nearby status message.
- Public registry search displays the bilingual query plan before source receipts. Each registry term has an explicit registry label; mapped versus pass-through state uses text plus color, and the two-column plan stacks without horizontal scrolling on small screens.
- Registry provenance and published study sites are separate visual facts. A TFDA Taiwan record may receive Taiwan-first ranking, but location filters, travel comparison, and Published sites labels use only actual site fields disclosed by a registry.
- A submitted exact broad cancer alias is reflected in a shareable `/trials?condition=...` URL. Deep links reject direct identifiers, multiline content, and detailed or unrecognized terms; those searches can still run but are not written to history. The deep link uses the same visible declarative WebMCP form rather than a hidden route.
- Masked note and extracted facts share one review surface. `Confirmed` is a column heading, `Confirm all` sits beside it, and row checkboxes use accessible names without repeated visible labels.
- Treatment, timing, subtype, stage, disease extent, and biomarker facts receive visible model-review-priority prompts. These prompts never claim an objective probability of correctness.
- Trial cards show patient-confirmed disease, subtype, stage, biomarker, and age separately from the registry comparison matrix.
- Trial cards place a compact detailed-criteria map directly below confirmed patient facts. Subtype, stage, biomarker, and prior treatment use an aligned two-by-two grid on wider cards and one column below 500px. Green shared term, red possible difference, yellow uncertain, and gray missing always include visible state text, confirmed fact, public wording, and trace field; color is never the sole meaning and the map is explicitly not final eligibility.
- Shortlisting is an explicit human action, capped at three cards. Two selections open an aligned desktop table; smaller screens receive equivalent stacked cards instead of page-wide horizontal overflow. Selection state is always announced as text, never color alone.
- A care-team discussion brief is a secondary result action, not a competing primary workflow step. Preview precedes download; the file warning names confirmed health information and local storage risk, while completion uses one atomic status message.
- Repeated comparison cells are color blocks with criterion, state, and rationale disclosed on pointer hover and keyboard focus. A visible legend and expanded text preserve non-color access.
- The WebMCP capability layer has one compact, collapsible live-status surface. Its atomic status sentence reports browser support and verified registration; tool names, permission locks, safety boundaries, and judge prompts appear only on disclosure.
- Missing `document.modelContext` is labelled as a browser-preview setup state, never as a generic website API failure. The unsupported disclosure preserves the fully usable fallback and gives a copyable Chrome testing-flag recovery path.
- The disclosed WebMCP session receipt is a compact metadata timeline, not a second live region. It shows UTC time and plain-text lifecycle changes, retains at most 20 events, stacks on small screens, and gives its explicit local JSON download a clear disabled and completion state.
- Outside the medical workflow, `/webmcp` may provide a dedicated competition-evidence dashboard. It leads with a single contextual status, uses text plus color for every check, progressively discloses execution output, and never requests medical context.
- The competition dashboard starts with a four-step judge runbook. Numbered cards remain equal-height on desktop, stack to two then one column, and explicitly label the manual Chrome Inspector boundary.
- Browser onboarding is a skippable three-layer explanation rather than a forced tour: the upstream specification installs nothing, Chrome local testing uses one native flag and relaunch, and TrialBridge registers tools automatically. Model Context Tool Inspector is always labelled as a separate optional developer/judge utility, not WebMCP itself.
- The WebMCP critical-user-journey map states the user goal, initial state, capability, visible UI reaction, and recovery at every stage. It uses a wrapping two-column card sequence rather than a horizontally scrolling timeline.
- Browser diagnostic evidence is download-only JSON with an adjacent atomic completion message. It contains runtime metadata only and never includes prompts, arguments, outputs, or health information.
- The live runtime lifecycle suite is one explicit action with one atomic status. Its fixed no-PHI probe is visibly described as temporary, read-only, and no-network; six text-labelled outcomes stay collapsed by default, failure never suppresses cleanup, and the result never implies Inspector completion.
- Recorded browser-runtime evidence appears once near the competition-page summary as a static server-rendered provenance banner. It shows browser version, pass count, cleanup state, console-error count, and no-PHI boundary in text; it links to the exact receipt and remains visually distinct from the current-browser check and manual Inspector gate.
- Origin Trial deployment readiness uses one compact native disclosure below recorded browser evidence. Its closed state distinguishes local testing, configured-but-unverified, and misconfigured states with text plus color; expanded metadata never exposes the token and always preserves Chrome validation as a separate gate.
- The manual Inspector acceptance kit uses six compact disclosure rows with equal header alignment, text-plus-color outcomes, 44px Pass/Needs attention controls, fixed visible prompts, one atomic contextual status, and a single download action. Outcomes stay in volatile state. Its receipt is visibly self-attested and cannot be presented as automatic browser proof.
- The Tool Contract Explorer uses one visible search label, wrapping availability filters, one atomic result/copy status, and compact native disclosure rows. Desktop rows align kind, tool name, availability, and expand affordance; mobile rows reflow without horizontal scrolling. Exact schemas, hints, budgets, human control, recovery, and source paths remain copyable/inspectable, while the static download is clearly separated from browser-runtime evidence.
- The Capability State Simulator uses four native `aria-pressed` controls in workflow order, one atomic contextual status, and text-plus-color Active/Locked rows. It keeps the declarative form visibly separate from imperative registration, shows the 2-2-6-7 sequence without animation, stacks the context and tool list on narrow screens, and labels the entire model synthetic rather than browser-runtime proof.
- Live provider availability is an explicit judge action, never an automatic page-load request. It uses fixed synthetic content, one atomic status, an aria-hidden elapsed countdown, a visible cancel/retry control, and a finite deadline; receipts retain metadata only.
- The competition preflight is a separate optional action before live diagnostics. It checks the fixed cloud probe and two public registries in parallel, uses one atomic contextual status, labels each dependency in text plus color, preserves partial results and recovery, and never returns trial records, prompts, model content, or health information. It is explicitly not Inspector or clinical-validation evidence.
- Live Agent Rehearsal follows preflight as a two-column desktop/one-column mobile workbench: fixed scenario choices on the left, one prominent prompt and expected boundary on the right, a four-stage prompt-to-no-execution flow, and a compact metadata receipt. It has no free-text field, uses text plus color for verdicts, exposes cancellation and a finite deadline, and never turns model selection into tool execution or Inspector evidence.
- A passed Traditional Chinese public-search rehearsal may reveal one visually nested, optional fixed-execution panel. It must require a second explicit click, name `executeTool()`, show elapsed and remaining time, preserve a cancel control and 44px targets, render a four-cell metadata receipt plus at most three public titles, and stack to one column on narrow screens. The panel must remain hidden for forbidden or contextual scenarios and state that the site—not Inspector or an external agent—orchestrated the fixed call.
- Completed cloud organization shows one compact, non-live extraction receipt before the two-column review. Requested/provider-reported model labels, transport, actual latency, and TrialBridge storage status remain visible; failures show code, elapsed time, and a retry/edit recovery path. Provider retention stays explicitly unassessed, and no note, fact, prompt, or model content enters the receipt.
- Ecosystem implementation cards are static server-rendered evidence with a date, upstream commit, primary-source link, and visible `Source-reported` boundary. They never imply that the current browser or local runtime was tested.
- Standards evidence includes a compact eight-clause upstream crosswalk with exact draft anchors, implementation paths, and verification class. It explicitly labels the upstream declarative section as TODO and the product as explainer-aligned rather than claiming normative declarative conformance.
- The judge conformance matrix separates repository-verified checks, recorded browser-runtime evidence, recorded model evaluation, and the remaining manual Inspector gate. Its static downloadable JSON contains only capability metadata, evidence paths, source links, and artifact digests; it never reads the current browser session or medical-workflow state and is labelled competition evidence rather than a protocol endpoint.
- The runbook's synthetic workflow uses a fixed `?demo=synthetic` deep link with no authored health content. It prepares the fictional note at the privacy boundary, announces that state in-page, and never bypasses masking, organization, confirmation, clarification, or matching. Clearing the anonymous conversation removes the fixed demo parameter.
- Social preview imagery uses the same calm editorial tokens and verified capability facts. It contains no patient imagery, testimonials, outcome claims, or remotely fetched fonts.

## Prohibited patterns

- No testimonials, urgency marketing, success-rate claims, carousels, glass effects, or decorative stock-medical imagery.
- No emoji as interface icons.
- No dark patterns around consent or cloud-model use.
- No interface statement that a person is eligible, that a trial will help, or that research participation should replace established care.
