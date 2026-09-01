# Data flow and trust boundaries

```text
raw free text
  -> browser memory only
  -> deterministic identifier masking
  -> explicit cloud-transfer consent
  -> localhost Ollama proxy -> gpt-oss:120b-cloud extraction
  -> draft profile with uncertainty
  -> patient or caregiver reviews masked note and draft facts together
  -> patient-confirmed de-identified profile
     -> registry query minimizer -> TFDA and ClinicalTrials.gov candidate discovery
     -> source-derived missing-field questions -> confirmed profile update or explicit unknown
     -> grouped, source-traceable comparison
     -> optional localhost proxy -> gpt-oss:120b-cloud conversation
     -> consent-gated WebMCP tools
```

## Data classes

| Class | Examples | Allowed destinations |
| --- | --- | --- |
| Raw sensitive text | pasted note, names, record numbers | browser volatile memory only |
| Masked text | note with direct identifiers replaced | gpt-oss:120b-cloud through localhost proxy, only after explicit transfer consent |
| Draft facts | model-extracted diagnosis, stage, biomarker | browser volatile memory only |
| Confirmed profile | user-approved, de-identified structured facts | registry query builder; optional cloud assistant; gated WebMCP |
| Public registry facts | study title, sites, criteria, update date | browser; matching engine; WebMCP with untrusted-content marking |

## Persistence

The anonymous MVP does not persist raw text, masked text, or the confirmed profile on the server. It does not use `localStorage`. A page refresh ends the session unless the user explicitly exports a local summary in a later milestone.

## Logging

Application logs contain request IDs, timing, status codes, adapter names, and aggregate counts only. They exclude request bodies, registry search terms derived from the profile, response bodies, and model prompts.
