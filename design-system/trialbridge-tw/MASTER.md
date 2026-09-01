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
- The patient/caregiver choice is not a standalone gate. Patient context is the default, and Agent mode may update caregiver context only after a clear user statement.
- Masked note and extracted facts share one review surface. `Confirmed` is a column heading, `Confirm all` sits beside it, and row checkboxes use accessible names without repeated visible labels.
- Treatment, timing, subtype, stage, disease extent, and biomarker facts receive visible model-review-priority prompts. These prompts never claim an objective probability of correctness.
- Trial cards show patient-confirmed disease, subtype, stage, biomarker, and age separately from the registry comparison matrix.
- Repeated comparison cells are color blocks with criterion, state, and rationale disclosed on pointer hover and keyboard focus. A visible legend and expanded text preserve non-color access.

## Prohibited patterns

- No testimonials, urgency marketing, success-rate claims, carousels, glass effects, or decorative stock-medical imagery.
- No emoji as interface icons.
- No dark patterns around consent or cloud-model use.
- No interface statement that a person is eligible, that a trial will help, or that research participation should replace established care.
