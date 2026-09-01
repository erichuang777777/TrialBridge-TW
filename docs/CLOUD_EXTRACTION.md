# Ollama cloud extraction

## Boundary

Raw free text exists only in the browser's volatile React state. `maskDirectIdentifiers()` replaces detected identifiers before any model request. After organization, the masked note remains visible beside the extracted facts throughout confirmation. Deterministic masking cannot guarantee removal of every name or contextual identifier.

The cloud extraction endpoint accepts only the strict `{ maskedText, subjectRole, language, cloudUseApproved: true }` object. It performs a second identifier scan and rejects the request if a common email, Taiwan national ID, phone, labelled medical-record number, labelled name, labelled birth date, or labelled address remains.

## Visible transfer action and model

The note-entry surface states that localhost is only an Ollama proxy and names the remote model. In Manual mode, selecting the explicit **Organize note and create review list** button initiates the transfer. In Agent mode, an explicit conversational request to organize the completed note produces the same bounded workflow action. A redundant checkbox is not shown. The server still requires `cloudUseApproved: true` as an assertion that the request came from the visible action.

All LLM processing is restricted to `gpt-oss:120b-cloud`. `validatedCloudModel()` rejects any other configured model. No local GPU or CPU inference path, model selector, fallback, or local-model API route is present.

## Model output

The request uses JSON mode and disables thinking output. The application enforces the full Zod `ProfileDraft` schema and deterministically supplies IDs, role, language, provenance, `confirmed: false`, and the safety statement. Each fact has bilingual display text and extraction confidence. Confidence is not clinical validity or eligibility confidence.

The cloud model must represent missing information as questions and may not diagnose, recommend treatment, claim benefit, reconstruct identifiers, or decide eligibility. The application does not persist the request or response, but provider-side handling must be reviewed separately before public launch.

The confirmation UI treats model-reported confidence only as a review-priority signal, never as a calibrated correctness probability. Treatment names and timing, histologic subtype, stage or disease extent, and biomarkers are always flagged for careful comparison with the source report. Lower-confidence fields receive an additional review prompt.

## Human confirmation

`confirmProfile()` creates a separate `ConfirmedProfile`; it never mutates the draft. Every used fact receives a confirmation timestamp and whether the patient or caregiver confirmed it. Later cloud dialogue starts disabled and requires another purpose-specific consent.
