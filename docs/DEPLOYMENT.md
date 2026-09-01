# Local development and deployment gates

## Windows local run

1. Install Ollama and pull a validated local model. The current default is `medgemma-cpu:latest`.
2. Run `ollama signin` only if optional cloud dialogue will be tested.
3. Copy `.env.example` to `.env.local`; do not add patient data or provider API keys.
4. Run `npm install`, then `npm run dev`.
5. Run `npm test`, `npm run typecheck`, `npm run build`, `npm run verify:registries`, `npm run verify:http`, and `npm run audit:clean-room`.

## Public deployment is intentionally gated

The server-side localhost proxy reaches the server machine, not a visitor's computer. Public deployment therefore requires a reviewed local companion design or a different explicit privacy architecture. Do not deploy the current local-extraction assumption as though it protected a remote visitor's note.

Before release, resolve every item in `READINESS.md`, host TFDA snapshots outside request-time decompression, configure rate limits and monitoring without medical payloads, obtain the exact WebMCP origin-trial token, and complete Chrome Inspector plus accessibility/browser acceptance.

No deployment may enable automated outreach, enrollment, booking, consent, or treatment recommendations.
