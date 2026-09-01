# Local extraction and confirmation

## Boundary

Raw free text exists only in the browser's volatile React state. `maskDirectIdentifiers()` runs before any request and replaces detected identifiers with typed placeholders. The person must be shown the masked preview because deterministic masking cannot guarantee detection of every name or context-specific identifier.

The local extraction endpoint accepts only the strict `{ maskedText, subjectRole, language }` object. It performs a second identifier scan and rejects the request if an email, Taiwan national ID, phone, labelled medical-record number, labelled name, labelled birth date, or labelled address remains.

## Ollama

`/api/local-model/extract` connects only to unauthenticated HTTP loopback addresses (`127.0.0.1`, `localhost`, or `::1`). `OLLAMA_BASE_URL` cannot target a LAN or internet host. `OLLAMA_LOCAL_MODEL` defaults to the local GPU model `medgemma:4b`. It has a 60-second hard limit and does not silently fall back. After a GPU failure, the person may explicitly choose the slower `OLLAMA_CPU_MODEL` for that attempt. Names ending in `:cloud` are forbidden for extraction.

This architecture is intended for local development and self-hosted use. A public website cannot assume that its server-side route reaches the visitor's computer. A reviewed local companion bridge is required before public deployment of this privacy boundary.

## Model output

Ollama runs in JSON mode with a compact field contract, and the application then enforces the full Zod `ProfileDraft` schema. IDs, role, language, provenance, `confirmed: false`, and the safety statement are generated deterministically by application code rather than trusted to model output. Each extracted fact has bilingual display text and extraction confidence. Confidence describes extraction certainty only; it is not clinical validity or eligibility confidence.

The model must represent missing information as questions and may not diagnose, recommend treatment, claim benefit, reconstruct identifiers, or decide eligibility.

The CPU model completed a synthetic five-fact extraction on the development machine, but took about one minute. GPU attempts currently fail because the installed Ollama CUDA runtime reports an unsupported PTX toolchain on the GTX 1050 Ti. This is now surfaced as a bounded, recoverable error rather than an indefinite loading state. Updating the GPU driver/runtime or validating a compatible Ollama build remains a performance gate.

`gpt-oss:120b-cloud` can be reached through the localhost Ollama proxy, but inference is still remote. It is therefore limited to separately approved dialogue over the confirmed, minimized summary and is never an extraction fallback.

## Human confirmation

`confirmProfile()` creates a separate `ConfirmedProfile`; it never mutates the draft. Every used fact receives a confirmation timestamp and whether the patient or caregiver confirmed it. Cloud use starts false and requires a later independent choice. Changing a confirmed matching fact must invalidate existing matches.
