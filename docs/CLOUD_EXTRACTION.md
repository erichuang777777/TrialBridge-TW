# Consented Ollama cloud extraction

## Boundary

Raw free text exists only in the browser's volatile React state. `maskDirectIdentifiers()` replaces detected identifiers before any model request. The person sees the complete masked preview because deterministic masking cannot guarantee removal of every name or contextual identifier.

The cloud extraction endpoint accepts only the strict `{ maskedText, subjectRole, language, cloudUseApproved: true }` object. It performs a second identifier scan and rejects the request if a common email, Taiwan national ID, phone, labelled medical-record number, labelled name, labelled birth date, or labelled address remains.

## Required consent and model

The transfer checkbox is unchecked by default and appears beside the masked preview. It states that localhost is only an Ollama proxy and that the masked medical content will leave the device. The request cannot be sent without this explicit approval.

All LLM processing is restricted to `gpt-oss:120b-cloud`. `validatedCloudModel()` rejects any other configured model. No local GPU or CPU inference path, model selector, fallback, or local-model API route is present.

## Model output

The request uses JSON mode and disables thinking output. The application enforces the full Zod `ProfileDraft` schema and deterministically supplies IDs, role, language, provenance, `confirmed: false`, and the safety statement. Each fact has bilingual display text and extraction confidence. Confidence is not clinical validity or eligibility confidence.

The cloud model must represent missing information as questions and may not diagnose, recommend treatment, claim benefit, reconstruct identifiers, or decide eligibility. The application does not persist the request or response, but provider-side handling must be reviewed separately before public launch.

## Human confirmation

`confirmProfile()` creates a separate `ConfirmedProfile`; it never mutates the draft. Every used fact receives a confirmation timestamp and whether the patient or caregiver confirmed it. Later cloud dialogue starts disabled and requires another purpose-specific consent.
