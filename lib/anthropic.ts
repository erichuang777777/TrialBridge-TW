/* ============================================================================
   Trialign — Anthropic client

   One place to construct the client and pin the model. The key is read from
   ANTHROPIC_API_KEY (env). We default to Claude Opus 4.8 — the eligibility
   calls are the trust surface, so we use the most capable model for both
   extraction and per-criterion reasoning.
   ========================================================================== */

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-4-8";

/** The triage pass only ranks candidates for reading order — it never issues a
 *  verdict and nothing is dropped on its say-so — so it runs on the cheap, fast
 *  model. That is what makes it affordable to widen the candidate pool instead
 *  of trusting the registry's relevance ordering. */
export const TRIAGE_MODEL = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.example) locally, " +
        "or to Vercel → Project → Settings → Environment Variables in production.",
    );
  }
  if (!client) client = new Anthropic();
  return client;
}
