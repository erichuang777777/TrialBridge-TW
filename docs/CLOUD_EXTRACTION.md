# Ollama cloud extraction

## Boundary

Raw free text exists only in the browser's volatile React state. `maskDirectIdentifiers()` replaces detected identifiers before any model request. After organization, the masked note remains visible beside the extracted facts throughout confirmation. Deterministic masking cannot guarantee removal of every name or contextual identifier.

The cloud extraction endpoint accepts only the strict `{ maskedText, subjectRole, language, cloudUseApproved: true }` object. It performs a second identifier scan and rejects the request if a common email, Taiwan national ID, phone, labelled medical-record number, labelled name, labelled birth date, or labelled address remains.

## Visible transfer action and model

The note-entry surface names the remote model and states that inference is remote-cloud-only. Two transports exist and `resolveOllamaEndpoint()` in `lib/llm/ollama.ts` chooses exactly one: without `OLLAMA_API_KEY`, the developer's loopback Ollama proxy (`gpt-oss:120b-cloud`); with a server-only key, Ollama's HTTPS Cloud API at `https://ollama.com` (`gpt-oss:120b`). A key paired with any other host, or a non-loopback URL without a key, throws before any request is made, so the key can never reach an arbitrary server and a misconfiguration can never route the masked note elsewhere. Health and receipts report only the transport name. In Manual mode, selecting the explicit **Organize note and create review list** button initiates the transfer. In Agent mode, an explicit conversational request to organize the completed note produces the same bounded workflow action. A redundant checkbox is not shown. The server still requires `cloudUseApproved: true` as an assertion that the request came from the visible action.

All LLM processing is restricted to one hosted model. `validatedCloudModel()` accepts only its two labels (`gpt-oss:120b-cloud` on the loopback proxy, `gpt-oss:120b` on the Cloud API) and returns the wire name for the active transport; any other configured model is rejected. No local GPU or CPU inference path, model selector, fallback, or local-model API route is present.

## Model output

The request uses JSON mode, disables thinking output, and streams. `POST /api/cloud/extract` answers a request with `Accept: text/event-stream` by sending headers immediately, then `progress` events that carry only the number of characters received so far, and finally one `result` or `failure` event with the same payload the JSON response would have carried. Partial model text is never forwarded, and the draft is validated only after the whole stream has arrived. Clients without the SSE accept header receive the original JSON response. The application enforces the full Zod `ProfileDraft` schema and deterministically supplies IDs, role, language, provenance, `confirmed: false`, and the safety statement. Each fact has bilingual display text and extraction confidence. Confidence is not clinical validity or eligibility confidence.

The cloud model must represent missing information as questions and may not diagnose, recommend treatment, claim benefit, reconstruct identifiers, or decide eligibility. The application does not persist the request or response, but provider-side handling must be reviewed separately before public launch.

After each extraction attempt, the route returns a nested metadata-only receipt. A successful receipt records requested and provider-reported model labels, localhost-proxy/remote-cloud transport, server-observed latency, masked-note request type, and `trialBridgePersisted: false`. A failed receipt adds only a bounded recovery code and elapsed time. The receipt never copies the note, extracted facts, prompts, model content, or detailed provider errors, and it explicitly keeps provider retention as `not_assessed`. The browser shows this receipt beside confirmation or the retry controls; it is not persisted or uploaded.

The confirmation UI treats model-reported confidence only as a review-priority signal, never as a calibrated correctness probability. Treatment names and timing, histologic subtype, stage or disease extent, and biomarkers are always flagged for careful comparison with the source report. Lower-confidence fields receive an additional review prompt.

## Human confirmation

`confirmProfile()` creates a separate `ConfirmedProfile`; it never mutates the draft. Every used fact receives a confirmation timestamp and whether the patient or caregiver confirmed it. Later cloud dialogue starts disabled and requires another purpose-specific consent.
