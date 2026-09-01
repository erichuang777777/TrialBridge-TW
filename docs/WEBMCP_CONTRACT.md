# WebMCP contract

WebMCP is a primary product interface, not an add-on. The site uses Chrome's `document.modelContext` imperative API and remains useful without an agent.

## Planned tool classes

### Public read tools

- Search public recruiting trials by non-sensitive topic and region.
- Read one normalized public trial record by registry ID.
- Explain the product's method, privacy boundaries, and registry coverage.

### Sensitive contextual tools

- Compare public trials to the current patient-confirmed summary.
- Explain an existing match and list unresolved questions.
- Create an outreach draft from a selected trial and confirmed summary.

## Security invariants

- No tool accepts or returns raw medical-record text, uploaded documents, direct identifiers, model prompts, cookies, or server tokens.
- Sensitive tools read only an in-memory, confirmed, de-identified summary and require active consent for each execution context.
- Registry output is tagged as untrusted external content and length-bounded.
- Tools never send messages, submit forms, enroll, schedule, consent, change treatment, or perform background surveillance.
- Tool results include source registry, retrieval time, limitations, and a patient-facing safety statement.
- Registration and cleanup are deterministic across client navigation and hot reload.

## Verification target

Chrome Model Context Tool Inspector must confirm discovery, JSON Schema validity, manual calls, natural-language selection, sensitive consent behavior, untrusted-content flags, output caps, and tool cleanup.
