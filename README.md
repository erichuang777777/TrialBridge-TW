# TrialBridge TW 試驗橋

TrialBridge TW is a Taiwan-first, chat-first navigator that helps people with cancer and their caregivers understand and discuss clinical-trial options in Taiwan, Asia, and worldwide.

This repository is a clean-room rebuild. Its product language, information architecture, design, schemas, workflows, and WebMCP contracts are original to TrialBridge TW.

## Product boundaries

- People may paste free-text medical information in Traditional Chinese or English.
- Direct identifiers are masked in the browser before any model request.
- The original free text is not persisted by default.
- After a separate, unchecked consent, the reviewed masked note is sent through the localhost Ollama proxy to `gpt-oss:120b-cloud` for extraction.
- All LLM work uses `gpt-oss:120b-cloud`; local GPU and CPU inference are prohibited.
- WebMCP tools never receive raw medical records and expose only confirmed, minimized data.
- Results are informational navigation aids, not medical advice, proof of benefit, or a final eligibility decision.
- Overseas-site outreach is prepared as a draft and is never sent automatically.

## Delivery plan

The independently verifiable milestones are defined in [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md). Product, security, data-flow, schema, chat-state, and WebMCP contracts live under `docs/`.

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
npm run build
```

## License

MIT — see [LICENSE](LICENSE).
