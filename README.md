# TrialBridge TW

**A Taiwan-first clinical-trial search experience that people and AI agents can use together.**

TrialBridge helps people find public cancer-trial records across Taiwan, Asia, and worldwide registries. Its WebMCP layer gives compatible browser agents small, typed, read-only tools instead of making them guess from the DOM.

## Try the live demo

- **Live app:** <https://trialbridge-tw.netlify.app/>
- **Three-minute WebMCP demo:** <https://trialbridge-tw.netlify.app/webmcp/quickstart>
- **Full evidence lab:** <https://trialbridge-tw.netlify.app/webmcp>
- **Repository:** <https://github.com/erichuang777777/TrialBridge-TW>

No login or patient data is required for the public demo.

### Judge path

1. Open the quickstart URL in Chrome 149+ with WebMCP enabled through the Origin Trial.
2. Confirm the two public tools: `search_public_cancer_trials` and `trialbridge_method`.
3. In the Model Context Tool Inspector, enter: `Find currently recruiting breast cancer trials.`
4. Confirm the agent selects the search tool and returns structured public registry results.
5. Open `/trials` to try the same search through the visible human interface.

The production Origin Trial and Chrome runtime were verified with Chrome 152. Inspector natural-language selection was tested with Gemini 3 Flash Preview. ChatGPT native WebMCP invocation is not claimed as part of the evidence.

## Why WebMCP fits

Clinical-trial search has structured inputs, public sources, and important safety boundaries. WebMCP lets an agent call the same public search capability that the person can see, while the site keeps control of permissions and human confirmation.

The public agent surface is intentionally small:

- Search public trial records with a general cancer condition.
- Explain the site's Taiwan-first search and privacy method.

No WebMCP tool can enroll someone, send a message, book an appointment, change treatment, or receive raw medical notes. Patient-context tools only appear after a visible, human-confirmed workflow state.

## What is built

- Taiwan-first bilingual query bridge for TFDA and ClinicalTrials.gov.
- Shared public trial index: Turso/libSQL in production, SQLite locally, with SQLite FTS5 search.
- Read-only public WebMCP tools registered through `document.modelContext`.
- Human-visible cancellation, permission-gated capabilities, and `toolchange` lifecycle handling.
- Remote-only Ollama Cloud model transport for approved, minimized workflows.
- No patient-note persistence in the public index or WebMCP output.

## Technology

Next.js · React · TypeScript · Node.js · WebMCP · Chrome Origin Trial · Turso/libSQL · SQLite FTS5 · Netlify · GitHub Actions · Ollama Cloud API · ClinicalTrials.gov API · TFDA data · Zod · Playwright

## Local development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Useful routes: `/trials` (public search), `/match` (protected workflow), `/webmcp/quickstart` (browser test), `/webmcp` (evidence lab), and `/api/health` (deployment health).

## Verification

```bash
npm test
npm run typecheck
npm run verify:webmcp
npm run build
npm run verify:http
```

Browser evidence and media are in [`evals/webmcp-browser-runtime-acceptance.json`](evals/webmcp-browser-runtime-acceptance.json), [`evals/webmcp-inspector-extension-runtime.json`](evals/webmcp-inspector-extension-runtime.json), [`artifacts/webmcp-youtube/trialbridge-webmcp-demo-1080p-v2.mp4`](artifacts/webmcp-youtube/trialbridge-webmcp-demo-1080p-v2.mp4), and [`docs/WEBMCP_VERIFICATION.md`](docs/WEBMCP_VERIFICATION.md).

## Deployment shape

The multi-gigabyte source index is not bundled into Netlify or GitHub. Production functions query the remote Turso/libSQL index with a read-only token. GitHub Actions owns scheduled ingestion with a separate read-write token. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Safety boundary

TrialBridge is an informational navigation aid, not medical advice or a final eligibility decision. Registry records describe research plans and do not prove benefit. Outreach and discussion documents are drafts only; the site never sends them automatically.

## License

MIT — see [`LICENSE`](LICENSE).
