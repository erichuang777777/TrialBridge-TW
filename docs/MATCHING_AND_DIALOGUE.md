# Matching, dialogue, and outreach

Matching accepts only a Zod-validated `ConfirmedProfile`. Registry retrieval uses Traditional Chinese confirmed labels for TFDA and English confirmed labels for ClinicalTrials.gov; this preserves bilingual recall while each assessment still traces to the same fact IDs.

Deterministic assessments cover condition wording, public recruitment status, structured age, structured sex, and region. Outcomes are `possibly_met`, `possibly_not_met`, or `unknown`. Overall labels are limited to `discuss`, `needs_information`, and `unlikely_based_on_public_record`; the product never returns `eligible`.

Optional cloud dialogue requires a second checkbox after confirmation. Through the localhost Ollama proxy, `gpt-oss:120b-cloud` receives only fact `id/domain/value`, the question, and up to five minimized public trial summaries. This dialogue request excludes the earlier masked note, display copies, timestamps, and identifiers. The extraction consent does not automatically authorize later dialogue. Thinking output is disabled and responses are not persisted by the application.

Outreach is created locally from confirmed facts and public registry information. It always includes `sent: false`; there is no send, email, message, enrollment, booking, or consent endpoint.
