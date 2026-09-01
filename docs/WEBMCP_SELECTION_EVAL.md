# WebMCP cloud-model selection baseline

## Recorded result

On 2026-09-01 UTC, TrialBridge TW ran 55 single-turn selection samples: eleven synthetic journeys repeated five times through the localhost Ollama proxy to the exact requested model `gpt-oss:120b-cloud`. The provider reported `gpt-oss:120b` for every response.

| Intent | Passed | What was expected |
| --- | ---: | --- |
| Direct | 30/30 | Select the method, search, follow-up, result, shortlist comparison, or outreach tool named by the request. |
| Ambiguous | 10/10 | Separate broad public search from a care-team discussion brief. |
| Recovery | 5/5 | Select the pending-question review tool while results are not ready. |
| Forbidden | 10/10 | Abstain from enrollment and raw-note access because no such tool exists. |
| **Total** | **55/55** | Expected tool and synthetic arguments, or expected safe abstention. |

The user-controlled shortlist journey selected `compare_shortlisted_trials` with the correct language argument in all 5/5 repetitions. All 10/10 forbidden enrollment and raw-note requests safely selected no tool. The method journey also selected `trialbridge_method` in all 5/5 repetitions after its description was clarified to cover search order, information protection, sources, and limitations. These 55 samples were one uninterrupted recorded run; failed samples would remain in the artifact rather than being retried away.

Recorded latency was 576 ms minimum, 653 ms median, 1,263 ms p95, and 4,420 ms maximum; the average was 740 ms. Latency is descriptive of this run, not a service-level claim.

The authoritative artifact is [`evals/webmcp-selection-baseline.json`](../evals/webmcp-selection-baseline.json). It records tool names, synthetic arguments, requested and reported model identifiers, latency, response-content character count, completion reason, and pass/fail details. It deliberately does not store prompts as patient data, model response content, or model thinking. Both the journey dataset and state-specific WebMCP tool metadata are locked by SHA-256 digests so `npm run verify:webmcp` rejects a stale artifact after contract changes.

## Method

The evaluator supplies the imperative tools available in each synthetic page state to Ollama `/api/chat` as typed function definitions. Temperature is zero, GPT-OSS thinking effort is `low`, output is bounded, and each request has a 60-second timeout. It chooses at most one tool and never executes the selected tool.

The eleven cases cover:

- direct English and Traditional Chinese requests;
- ambiguous public search and care-team brief phrasing;
- pending-question recovery before result cards exist;
- result explanation, a two-trial user-controlled shortlist comparison, and one-specific-trial outreach with synthetic identifiers; and
- requests to enroll or access raw notes, where safe abstention is required.

Run the same bounded evaluation with:

```bash
npm run eval:webmcp:live -- --repetitions 5 --timeout-ms 60000 --output evals/webmcp-selection-baseline.json
npm run verify:webmcp
```

This command sends only the repository's synthetic evaluation prompts and arguments. It must never be pointed at patient-authored text.

## Interpretation boundary

This is evidence that one cloud model selected TrialBridge TW's current tool contracts correctly in a finite synthetic sample. It is not a WebMCP tool-execution test, browser registration test, declarative-form test, permission-transition test, cancellation test, multi-turn agent evaluation, clinical-safety evaluation, fairness evaluation, or eligibility-accuracy measurement.

Chrome Model Context Tool Inspector remains the required browser-origin gate for discovery, natural-language selection in the browser, manual execution, registration cleanup, and permission transitions. The recorded baseline supplements that gate; it does not replace it.
