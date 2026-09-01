# Readiness status

## Verified in this repository

- Clean-room replacement and tracked-file legacy scan.
- Anonymous in-memory chat state with no browser persistence API.
- Browser masking fixtures plus server-side identifier rejection.
- Loopback-only local model and prohibition on cloud extraction models.
- Patient-confirmed profile boundary and separate cloud/WebMCP consent.
- Live TFDA zipped JSON parsing and ClinicalTrials.gov API v2 retrieval.
- Taiwan-to-Asia-to-world ranking, explicit-ID deduplication, and source traces.
- Live synthetic local MedGemma extraction, confirmed-profile matching, and consented qwen cloud dialogue.
- Read-only WebMCP tool definitions, output limits, untrusted-content annotations, and consent-driven sensitive tool registration.
- TypeScript, production build, dependency audit, HTTP routes, and security headers.

## Not yet proven and required before public clinical use

- No cancer group is clinically validated. All 19 coverage groups are `unreviewed`; searchability is not accuracy.
- Deterministic masking cannot guarantee removal of every name or contextual identifier.
- The CPU extraction path took about one minute on this machine; production latency is not accepted.
- TFDA's full archive is currently decompressed on first request; production needs a scheduled validated snapshot.
- Eligibility criteria beyond structured condition, recruitment, age, sex, and region are not yet atomically assessed.
- No oncologist/research-nurse adjudicated gold set, false-eligible measurement, calibration, or subgroup fairness evaluation exists.
- Taiwan privacy-law review, clinical governance, threat-model review, incident response, data-processing records, abuse controls, and user research are incomplete.
- Chrome Model Context Tool Inspector and real WebMCP natural-language selection were not run because the installed browser-control runtime is incomplete.
- Visual QA at 375px, landscape, large text, keyboard-only, screen reader, and reduced motion has not been run in a real browser.

TrialBridge TW is therefore an engineering MVP for controlled local development, not a public clinical service.
