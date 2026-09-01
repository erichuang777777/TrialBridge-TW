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
- The `/webmcp` evidence page adds a five-stage critical-user-journey map aligned with Chrome's current goal/state/role-play/recovery framework, an explicit body-free `gpt-oss:120b-cloud` smoke test using fixed synthetic text, and a one-click browser diagnostic JSON receipt containing metadata only and no health information.
- The same page includes a six-check Chrome Inspector acceptance kit with fixed no-PHI prompts, explicit expected boundaries, Pass/Needs attention recording, and a download-only manual self-attestation receipt. It never presents that receipt as automatic or cryptographic Chrome evidence.
- The `/webmcp` Tool Contract Explorer exposes all eight canonical contracts with searchable availability filters, exact JSON Schemas, security hints, input/output budgets, human-control boundaries, and recovery paths. `/webmcp/contracts.json` serves the same static no-health-data catalog; runtime tools and the visible declarative form import the same canonical definitions so judge evidence cannot drift from execution.
- Results are informational navigation aids, not medical advice, proof of benefit, or a final eligibility decision.
- Overseas-site outreach is prepared as a draft and is never sent automatically.
- After results, a person can explicitly create a local care-team Markdown brief with confirmed facts, source links, uncertainty, and a health-information storage warning; TrialBridge TW never uploads or sends it.
- A person can visibly shortlist two or three result cards for aligned side-by-side comparison. Only then can the permission-gated, read-only WebMCP comparison tool appear; it cannot choose or alter the shortlist.
- Public condition search uses a versioned 19-group bilingual query bridge: exact curated terms become a Traditional Chinese TFDA query and an English ClinicalTrials.gov query, while unrecognized detailed terms pass through unchanged without inferred subtype, stage, or biomarker.
- Registry receipts distinguish a live query, fresh server snapshot, and bounded stale snapshot with the true snapshot load time. TFDA data is fresh for 24 hours, may serve stale while one refresh runs for at most seven days, and fails closed beyond that limit.
- Each public registry has an independent 20-second response deadline. The visible search and WebMCP output report per-source latency and complete/partial/unavailable coverage; one timeout does not erase verified results from another registry.
- Imperative WebMCP cancellation propagates from the agent execution signal through browser fetch, the Next.js request, matching, and each registry adapter. A cancelled caller stops immediately without destroying a shared TFDA snapshot refresh that another request may still need.
- Public discovery is fail-closed: canonical links, page-specific social metadata, a local-font Open Graph card, a manifest, and dynamic robots/sitemap routes are present, but indexing activates only with an explicit non-loopback HTTPS deployment profile after readiness approval.
- The `/webmcp` page starts with a four-step judge runbook. Exact broad cancer aliases can use shareable `/trials?condition=...` links in the same visible declarative form; a fixed `/?demo=synthetic` link opens the fictional case at the privacy boundary without skipping any protected stage. Neither route stores patient-authored content in the URL.
- The `/webmcp` page also shows a dated, source-linked implementation landscape for ChatGPT Desktop, Chrome, and Brave. Those cards are explicitly source-reported ecosystem evidence, not a claim that the current browser completed TrialBridge TW's runtime or Inspector checks.
- A compact judge conformance matrix classifies every WebMCP claim as repository-verified, recorded model evaluation, or a remaining manual Inspector gate. `/webmcp/evidence.json` exposes the same static, source-linked bundle with artifact digests and no browser-session or medical-workflow data; it is competition evidence, not a WebMCP protocol endpoint.
- An optional one-click competition preflight checks the fixed cloud probe, TFDA, and ClinicalTrials.gov in parallel before a judge enters the protected workflow. It is body-free, cancellable, shares the three-per-ten-minute cloud limit, returns no trial records or model content, and labels partial dependencies instead of collapsing them into one green score.
- Cloud organization now leaves a volatile, metadata-only receipt beside confirmation: requested/provider-reported model labels, localhost-proxy/remote-cloud transport, actual server latency, and TrialBridge non-persistence. Failures show a bounded code, elapsed time, and retry/edit path without copying medical or model content.

## Delivery plan

The independently verifiable milestones are defined in [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md). Product, security, data-flow, schema, chat-state, and WebMCP contracts live under `docs/`.

For evaluation, open the built-in [`/webmcp`](http://localhost:3000/webmcp) evidence page and its static [`/webmcp/contracts.json`](http://localhost:3000/webmcp/contracts.json) contract artifact, then see [Why WebMCP is essential to TrialBridge TW](docs/WEBMCP_JUDGE_GUIDE.md), the [recorded cloud-model selection baseline](docs/WEBMCP_SELECTION_EVAL.md), the [five-minute judge demonstration](docs/WEBMCP_JUDGE_GUIDE.md#five-minute-judge-demonstration), and the [production Lighthouse audit](docs/LIGHTHOUSE_AUDIT.md). The home page includes a WebMCP Live registration surface and a fictional, non-skipping competition case.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Guided matching is on the home page; `/trials` provides direct public-registry browsing without medical intake; `/webmcp` provides live, browser-specific competition evidence.

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

`verify:webmcp:receipts` validates a user-downloaded runtime diagnostic against the current two-public-tool and security-header contract. A second Inspector receipt is accepted only when all six manual checks are marked Pass; the verifier still labels it `manual_self_attestation`, never browser-generated proof.

`GET /api/health` provides a payload-free configuration check. `POST /api/cloud/probe` is the separate 30-second live check, limited to three attempts per 10 minutes. Public and model-backed routes have process-local request limits for the MVP; a multi-instance deployment must use the shared-store and trusted-proxy gates in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

The default build remains `noindex`. After every gate in `docs/READINESS.md` is approved, a reviewed public deployment must set both `SITE_URL=https://your-exact-origin.example` and `SITE_INDEXING_ENABLED=true`; either missing or unsafe value fails closed.

## License

MIT — see [LICENSE](LICENSE).
