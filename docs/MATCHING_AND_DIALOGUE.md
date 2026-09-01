# Matching, dialogue, and outreach

Matching accepts only a Zod-validated `ConfirmedProfile`. Registry retrieval uses Traditional Chinese confirmed labels for TFDA and English confirmed labels for ClinicalTrials.gov; this preserves bilingual recall while each assessment still traces to the same fact IDs.

Each result uses a fixed six-part public-record comparison: condition wording, recruitment status, age, sex, location, and other eligibility details. The four outcomes are `possibly_met` (green/aligned), `possibly_not_met` (red/different), `unknown` (yellow/uncertain), and `missing` (gray/missing information). Every colored block also has a visible text label, and the complete bilingual rationale, registry field, and source link remain available in the card disclosure. Overall labels are limited to `discuss`, `needs_information`, and `unlikely_based_on_public_record`; the product never returns `eligible`.

Condition overlap is only a terminology intersection between the patient-confirmed summary and public registry wording. Other eligibility details remain uncertain until reviewed criterion by criterion; the interface must not convert text overlap into an eligibility decision.

Optional cloud dialogue requires a second checkbox after confirmation. Through the localhost Ollama proxy, `gpt-oss:120b-cloud` receives only fact `id/domain/value`, the question, and up to five minimized public trial summaries. This dialogue request excludes the earlier masked note, display copies, timestamps, and identifiers. The extraction consent does not automatically authorize later dialogue. Thinking output is disabled and responses are not persisted by the application.

Outreach is created locally from confirmed facts and public registry information. It always includes `sent: false`; there is no send, email, message, enrollment, booking, or consent endpoint.
