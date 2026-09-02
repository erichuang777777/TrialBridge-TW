# TrialBridge TW 試驗橋

TrialBridge TW is a Taiwan-first, chat-first navigator that helps people with cancer and their caregivers understand and discuss clinical-trial options in Taiwan, Asia, and worldwide.

This repository is a clean-room rebuild. Its product language, information architecture, design, schemas, workflows, and WebMCP contracts are original to TrialBridge TW.

## Product boundaries

- People may paste free-text medical information in Traditional Chinese or English.
- Direct identifiers are masked in the browser before any model request.
- The original free text is not persisted by default.
- The reviewed masked note is sent through the localhost Ollama proxy to `gpt-oss:120b-cloud` only when the person selects the visible cloud-organization action; there is no redundant checkbox.
- All LLM work uses `gpt-oss:120b-cloud`; local GPU and CPU inference are prohibited.
- WebMCP tools never receive raw medical records and expose only confirmed, minimized data.
- The WebMCP layer includes one visible declarative form, up to seven read-only imperative tools, payload-free execution status, a downloadable tab-local capability receipt, eleven deterministic journey cases, and a no-PHI 55-sample `gpt-oss:120b-cloud` selection baseline (55/55 recorded pass; all forbidden and shortlist cases passed).
- `/webmcp/quickstart` is the three-minute evaluation entrance: it registers and discovers exactly the two public same-origin tools, verifies the three response headers, and lets a judge explicitly execute only the fixed no-input `trialbridge_method`. It accepts no free text, makes no model or registry call, reads no patient context, and persists no result. `/webmcp` remains the full technical appendix.
- The `/webmcp` evidence page adds a five-stage critical-user-journey map aligned with Chrome's current goal/state/role-play/recovery framework, an explicit body-free `gpt-oss:120b-cloud` smoke test using fixed synthetic text, and a one-click browser diagnostic JSON receipt containing metadata only and no health information.
- Its explicit live lifecycle suite briefly registers one fixed read-only, no-network probe and verifies `registerTool`, same-origin discovery, bounded public execution, execution cancellation, `toolchange`, AbortSignal unregistration, and final cleanup. The probe is removed before results appear; downloaded receipts store check outcomes only and remain separate from Inspector evidence.
- A recorded no-PHI Chrome for Testing 153.0.8010.12 run passed all 6/6 lifecycle checks with zero console errors, left only the two expected public tools, and confirmed the temporary probe was absent after cleanup. The exact receipt is stored at `evals/webmcp-browser-runtime-acceptance.json`; this is browser API evidence, not natural-language Inspector or production Origin Trial evidence.
- Production Origin Trial configuration is fail-closed: one server-only token is accepted only with an exact non-loopback HTTPS `SITE_URL`, emitted before WebMCP access, omitted from health/evidence JSON, and reported as configured-but-unverified until Chrome DevTools and Inspector acceptance are complete.
- The same page includes a six-check Chrome Inspector acceptance kit with fixed no-PHI prompts, explicit expected boundaries, Pass/Needs attention recording, and a download-only manual self-attestation receipt. It never presents that receipt as automatic or cryptographic Chrome evidence.
- The `/webmcp` Tool Contract Explorer exposes all eight canonical contracts with searchable availability filters, exact JSON Schemas, security hints, input/output budgets, human-control boundaries, and recovery paths. `/webmcp/contracts.json` serves the same static no-health-data catalog; runtime tools and the visible declarative form import the same canonical definitions so judge evidence cannot drift from execution.
- A no-PHI Capability State Simulator makes dynamic registration visible as `2 → 2 → 6 → 7`: public tools, confirmed summary with permission still off, permission-enabled context, and two user-shortlisted trials. Every state is tested against the real runtime tool builder, but remains explicitly separate from current-browser Inspector evidence.
- Results are informational navigation aids, not medical advice, proof of benefit, or a final eligibility decision.
- Each result includes a traceable four-domain wording map for subtype, stage, biomarker, and prior treatment. Shared terms, possible differences, uncertainty, and missing information are shown with text plus color and do not alter overall status; explicit treatment wording in a published exclusion section remains a separate review signal.
- Overseas-site outreach is prepared as a draft and is never sent automatically.
- After results, a person can explicitly create a local care-team Markdown brief with confirmed facts, source links, uncertainty, and a health-information storage warning; TrialBridge TW never uploads or sends it.
- A person can visibly shortlist two or three result cards for aligned side-by-side comparison. Only then can the permission-gated, read-only WebMCP comparison tool appear; it cannot choose or alter the shortlist.
- Public condition search uses a versioned 19-group bilingual query bridge: exact curated terms become a Traditional Chinese TFDA query and an English ClinicalTrials.gov query, while unrecognized detailed terms pass through unchanged without inferred subtype, stage, or biomarker.
- Registry receipts distinguish a live query, process-memory cache, and validated scheduled file with the true snapshot load time. Production can run `npm run sync:tfda-snapshot` against shared durable storage; every artifact is source-locked, count- and SHA-256-validated, atomically replaced, fresh for 24 hours, and rejected beyond seven days.
- Each public registry has an independent 20-second response deadline. The visible search and WebMCP output report per-source latency and complete/partial/unavailable coverage; one timeout does not erase verified results from another registry.
- Imperative WebMCP cancellation propagates from the agent execution signal through browser fetch, the Next.js request, matching, and each registry adapter. A cancelled caller stops immediately without destroying a shared TFDA snapshot refresh that another request may still need.
- Public discovery is fail-closed: canonical links, page-specific social metadata, a local-font Open Graph card, a manifest, and dynamic robots/sitemap routes are present, but indexing activates only with an explicit non-loopback HTTPS deployment profile after readiness approval.
- The `/webmcp` page starts with a four-step judge runbook. Exact broad cancer aliases can use shareable `/trials?condition=...` links in the same visible declarative form; a fixed `/match?demo=synthetic` link opens the fictional case at the protected workflow boundary without skipping masking, organization, confirmation, clarification, or matching. Neither route stores patient-authored content in the URL.
- The `/webmcp` page also shows a dated, source-linked implementation landscape for ChatGPT Desktop, Chrome, and Brave. Those cards are explicitly source-reported ecosystem evidence, not a claim that the current browser completed TrialBridge TW's runtime or Inspector checks.
- A compact judge conformance matrix keeps repository verification, recorded browser runtime, recorded model evaluation, and the remaining manual Inspector gate distinct. `/webmcp/evidence.json` exposes the same static, source-linked bundle with artifact digests and no current-browser-session or medical-workflow data; it is competition evidence, not a WebMCP protocol endpoint.
- An optional one-click competition preflight checks the fixed cloud probe, TFDA, and ClinicalTrials.gov in parallel before a judge enters the protected workflow. It is body-free, cancellable, shares the three-per-ten-minute cloud limit, returns no trial records or model content, and labels partial dependencies instead of collapsing them into one green score.
- A live, fixed-input Agent Rehearsal lets judges ask `gpt-oss:120b-cloud` to choose among the capabilities available in four synthetic page states. It includes Traditional Chinese search, shortlist comparison, and forbidden enrollment abstention; returns only selected tool metadata and bounded finding codes; executes no tool; stores no model prose or thinking; and remains explicitly separate from Chrome Inspector evidence.
- After the Traditional Chinese rehearsal selects the expected public-search capability, a separate explicit action can execute only the fixed public condition `胃癌` through the current browser's `document.modelContext.executeTool()`. The 25-second, cancellable result is reduced to a volatile bilingual-query/source receipt; it accepts no free text or patient context and is labelled site-orchestrated evidence rather than Inspector or external-agent proof.
- Cloud organization now leaves a volatile, metadata-only receipt beside confirmation: requested/provider-reported model labels, localhost-proxy/remote-cloud transport, actual server latency, and TrialBridge non-persistence. Failures show a bounded code, elapsed time, and retry/edit path without copying medical or model content.

## Delivery plan

The independently verifiable milestones are defined in [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md). Product, security, data-flow, schema, chat-state, and WebMCP contracts live under `docs/`.

For evaluation, start at the built-in [`/webmcp/quickstart`](http://localhost:3000/webmcp/quickstart) three-minute route, then open the full [`/webmcp`](http://localhost:3000/webmcp) evidence lab, the [recorded Chrome lifecycle receipt](evals/webmcp-browser-runtime-acceptance.json), and the static [`/webmcp/contracts.json`](http://localhost:3000/webmcp/contracts.json) contract artifact. Then see [Why WebMCP is essential to TrialBridge TW](docs/WEBMCP_JUDGE_GUIDE.md), the [recorded cloud-model selection baseline](docs/WEBMCP_SELECTION_EVAL.md), and the [production Lighthouse audit](docs/LIGHTHOUSE_AUDIT.md). The quick route is concise current-browser evidence; it does not replace the manual Inspector gate.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Guided matching is on the home page; `/trials` provides direct public-registry browsing without medical intake; `/webmcp/quickstart` is the concise judge entrance; `/webmcp` provides the complete browser-specific competition evidence lab.

## Verification

```bash
npm test
npm run typecheck
npm run verify:webmcp
npm run verify:webmcp:receipts -- <browser-diagnostic.json> [manual-inspector.json]
npm run eval:webmcp:live -- --repetitions 5 --timeout-ms 60000
npm run build
npm run verify:http
```

After the application is running, `npm run verify:cloud` is an explicit live provider check. It sends one fixed synthetic prompt, no request body or medical content, and prints metadata only; it is deliberately excluded from deterministic CI because it incurs a real cloud request.

Production TFDA ingestion is a separate scheduled operation: set one absolute `TFDA_SNAPSHOT_PATH`, then run `npm run sync:tfda-snapshot` at least daily. It downloads a large public registry export and is intentionally not part of the ordinary local or CI verification block. A metadata-only live proof is retained at [evals/tfda-snapshot-ingestion.json](evals/tfda-snapshot-ingestion.json); the 175 MB temporary snapshot itself was validated and removed, not committed.

`verify:webmcp:receipts` validates a schema-1.1 user-downloaded runtime diagnostic against the current two-public-tool, security-header, and six-check lifecycle contract. A second Inspector receipt is accepted only when all six manual checks are marked Pass; the verifier still labels it `manual_self_attestation`, never browser-generated proof.

`GET /api/health` provides a payload-free configuration check, including bounded TFDA snapshot state without its path or records. `POST /api/cloud/probe` is the separate 30-second live check, limited to three attempts per 10 minutes. Public and model-backed routes have process-local request limits for the MVP; a multi-instance deployment must use the shared-store and trusted-proxy gates in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

The default build remains `noindex`. After every gate in `docs/READINESS.md` is approved, a reviewed public deployment must set both `SITE_URL=https://your-exact-origin.example` and `SITE_INDEXING_ENABLED=true`; either missing or unsafe value fails closed.

## License

MIT — see [LICENSE](LICENSE).
