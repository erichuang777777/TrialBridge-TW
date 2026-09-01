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
- Results are informational navigation aids, not medical advice, proof of benefit, or a final eligibility decision.
- Overseas-site outreach is prepared as a draft and is never sent automatically.

## Delivery plan

The independently verifiable milestones are defined in [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md). Product, security, data-flow, schema, chat-state, and WebMCP contracts live under `docs/`.

For evaluation, see [Why WebMCP is essential to TrialBridge TW](docs/WEBMCP_JUDGE_GUIDE.md), the [five-minute judge demonstration](docs/WEBMCP_JUDGE_GUIDE.md#five-minute-judge-demonstration), and the [production Lighthouse audit](docs/LIGHTHOUSE_AUDIT.md). The home page includes a WebMCP Live registration surface and a fictional, non-skipping competition case.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Guided matching is on the home page; `/trials` provides direct public-registry browsing without medical intake.

## Verification

```bash
npm test
npm run typecheck
npm run verify:webmcp
npm run build
npm run verify:http
```

`GET /api/health` provides a payload-free configuration check. Public and model-backed routes have process-local request limits for the MVP; a multi-instance deployment must use the shared-store and trusted-proxy gates in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## License

MIT — see [LICENSE](LICENSE).
