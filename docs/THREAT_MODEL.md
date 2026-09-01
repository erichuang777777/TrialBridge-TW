# Threat model

## Protected assets

- Cancer and treatment information, identity clues, contact details, and caregiver relationship.
- Patient confirmation decisions, generated outreach drafts, and locally downloaded discussion briefs.
- Integrity and provenance of trial records and matching explanations.

## Principal threats and controls

| Threat | Required control |
| --- | --- |
| Direct identifiers sent to a model | Browser masking before any network call; local proxy rejects common identifiers; no raw-note API route |
| Sensitive data in browser persistence | Volatile state only; no `localStorage`, IndexedDB, or service-worker cache. URL state is limited to exact aliases from the curated broad cancer lexicon; direct identifiers, multiline content, and unrecognized detailed conditions are removed and never echoed into browser history |
| Exported health summary disclosed from the device | Explicit user-created download only; visible health-information warning; generic filename; no automatic upload, share, or send action |
| Cloud-model overreach | Visible post-mask cloud-organization action; explicit disclosure that localhost is only a proxy; exact `gpt-oss:120b-cloud` allowlist; Zod validation; second purpose-specific consent for confirmed-profile dialogue |
| Prompt injection in registry text | Treat registry content as untrusted data; never execute embedded instructions; separate system policy from evidence |
| WebMCP over-disclosure | Tool schemas accept confirmed profile references, minimized facts, or registry-derived pending questions only; sensitive tools require active consent and visible user action; lifecycle status contains only tool name and state |
| WebMCP receipt becomes a shadow health log | Keep at most 20 events in current-tab memory; record only UTC time, tool names, verified capability changes, and lifecycle state; exclude prompts, arguments, outputs, detailed errors, profile facts, and trial results; download only after visible user action; never upload |
| Manual Inspector checklist is mistaken for automatic browser proof | Label the artifact self-attested and not cryptographically verified; store case IDs/outcomes only; keep runtime and Inspector evidence classes separate; require every case to pass in the offline verifier; retain the explicit non-proof boundary |
| Tool-contract documentation drifts from executable authority | Runtime imperative tools and the visible declarative form import canonical contract definitions; derive the explorer, inventory, judge bundle, and static JSON from the same catalog; test exact schema/annotation equality and Chrome character budgets |
| Public contract catalog becomes a health-data or runtime side channel | Force-static metadata only; no request, browser session, workflow state, note, profile, result, prompt, argument, or output access; label it implementation evidence rather than a protocol or Inspector result |
| Synthetic capability simulator is mistaken for a live permission test | Label every state synthetic and no-PHI; execute no tool; retain the separate browser diagnostic and manual Inspector gate; unit-test the 2-2-6-7 model against runtime construction without claiming browser registration |
| Runtime diagnostic probe becomes a hidden capability or payload channel | Register only after an explicit judge action; use a unique fixed read-only tool with one fixed enum, no page reads and no network; expose only to the current origin; abort registration in `finally`; require post-run non-discovery; store only check IDs/outcomes and never arguments or outputs; keep Inspector claims separate |
| Agent silently chooses preferred trials | Shortlist membership can change only through visible result-card controls; the comparison tool accepts language only, reads at most three current IDs from page state, and is unregistered below two selections |
| Agent sends or enrolls | No send, submit, enroll, book, consent, or treatment-change tools |
| False certainty | Unknown is first-class; source and update date shown; final eligibility reserved for study team |
| Cross-user exposure | Anonymous in-memory sessions; no shared server conversation store |
| Log leakage | Metadata-only structured logs and automated secret/PHI fixtures |
| Stale or conflicting registries | Preserve source records, timestamps, and conflicts; never silently overwrite disagreement |
| Bilingual query bridge invents clinical detail | Use exact aliases from a versioned 19-group navigation lexicon; expose both outgoing registry terms and the mapping strategy; pass unrecognized detail through unchanged; never infer subtype, stage, biomarker, histology, or eligibility |
| Search deep link leaks detailed medical context | Persist only a curated broad cancer condition and open-record flag; execute detailed pass-through searches without writing them to the URL; warn that public search links may remain in browser history or infrastructure URL logs |
| Competition preflight becomes an unbounded cloud or registry proxy | Accept no request body; use only repository-owned fixed synthetic/cloud and broad public-registry inputs; share the cloud-probe rate limit; propagate cancellation and source deadlines; return metadata and bounded failure codes without trial records, provider content, or health information |

## Deployment gates

Public deployment requires security review, Taiwan privacy-law review, data-processing inventory, incident response, abuse controls, clinical governance, accessibility audit, and WebMCP origin-trial verification.
