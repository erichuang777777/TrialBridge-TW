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
- The WebMCP layer includes one visible declarative form, up to seven read-only imperative tools, payload-free execution status, a downloadable tab-local capability receipt, eleven deterministic journey cases, and a no-PHI 55-sample `gpt-oss:120b-cloud` selection baseline (54/55 recorded pass; all forbidden and shortlist cases passed).
- Results are informational navigation aids, not medical advice, proof of benefit, or a final eligibility decision.
- Overseas-site outreach is prepared as a draft and is never sent automatically.
- After results, a person can explicitly create a local care-team Markdown brief with confirmed facts, source links, uncertainty, and a health-information storage warning; TrialBridge TW never uploads or sends it.
- A person can visibly shortlist two or three result cards for aligned side-by-side comparison. Only then can the permission-gated, read-only WebMCP comparison tool appear; it cannot choose or alter the shortlist.
- Public condition search uses a versioned 19-group bilingual query bridge: exact curated terms become a Traditional Chinese TFDA query and an English ClinicalTrials.gov query, while unrecognized detailed terms pass through unchanged without inferred subtype, stage, or biomarker.
- Public discovery is fail-closed: canonical links, page-specific social metadata, a local-font Open Graph card, a manifest, and dynamic robots/sitemap routes are present, but indexing activates only with an explicit non-loopback HTTPS deployment profile after readiness approval.
- The `/webmcp` page starts with a four-step judge runbook. Exact broad cancer aliases can use shareable `/trials?condition=...` links in the same visible declarative form; direct identifiers and detailed or unrecognized terms are never retained in the URL.

## Delivery plan

The independently verifiable milestones are defined in [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md). Product, security, data-flow, schema, chat-state, and WebMCP contracts live under `docs/`.

For evaluation, open the built-in [`/webmcp`](http://localhost:3000/webmcp) evidence page, then see [Why WebMCP is essential to TrialBridge TW](docs/WEBMCP_JUDGE_GUIDE.md), the [recorded cloud-model selection baseline](docs/WEBMCP_SELECTION_EVAL.md), the [five-minute judge demonstration](docs/WEBMCP_JUDGE_GUIDE.md#five-minute-judge-demonstration), and the [production Lighthouse audit](docs/LIGHTHOUSE_AUDIT.md). The home page includes a WebMCP Live registration surface and a fictional, non-skipping competition case.

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
npm run eval:webmcp:live -- --repetitions 5 --timeout-ms 60000
npm run build
npm run verify:http
```

`GET /api/health` provides a payload-free configuration check. Public and model-backed routes have process-local request limits for the MVP; a multi-instance deployment must use the shared-store and trusted-proxy gates in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

The default build remains `noindex`. After every gate in `docs/READINESS.md` is approved, a reviewed public deployment must set both `SITE_URL=https://your-exact-origin.example` and `SITE_INDEXING_ENABLED=true`; either missing or unsafe value fails closed.

## License

MIT — see [LICENSE](LICENSE).
