# Trialign

A patient- and caregiver-facing clinical trial matcher with **coordinator-grade output** — describe
your situation, upload a note, or connect your records, and Trial surfaces the **recruiting
ClinicalTrials.gov trials** you may be eligible for, with the inclusion/exclusion reasoning shown and
sourced for **every** match. The intake speaks to you in plain language; the output is rigorous and
clinical, framed as *"what to bring to your care team."* Built for the Cerebral Valley × Anthropic ×
Gladstone "Build Beyond the Bench" hackathon.

[![Trialign — product demo](https://img.youtube.com/vi/RlR9nHIMiyA/maxresdefault.jpg)](https://youtu.be/RlR9nHIMiyA?si=Qcgol8YOEmXFyMNY)

> Informational support for a conversation with your care team — not medical advice or a final
> eligibility determination. Trial data is pulled live from ClinicalTrials.gov. Use synthetic
> personas only; no real PHI.

## Stack

- **Next.js 16 (App Router) + React 19 + TypeScript** — one app, deploys to Vercel with zero config.
- **ClinicalTrials.gov API v2** — live recruiting-trial data (no API key needed). Proxied
  server-side because the registry doesn't send CORS headers.
- **Anthropic API (Claude Opus 4.8)** — reads the note into a structured profile and reasons
  each trial's eligibility criteria into a per-criterion verdict ledger. A cheap **Haiku 4.5**
  pass orders the candidate queue, so widening the search doesn't multiply the Opus bill.

The agent/registry work runs entirely in **server route handlers**, so the Anthropic key never
reaches the browser.

## Run it locally

```bash
npm install
cp .env.example .env.local     # then paste your ANTHROPIC_API_KEY into .env.local
npm run dev                    # http://localhost:3000
```
Click **"Try a sample patient (Margaret)"** to run the whole flow. Light mode is the default; a
**Dark** toggle sits in the header.

The flow, end to end:

**landing → capture → clarify → confirm → reason → results → the Fork**

### The Fork — which doors a next treatment closes

After Results, the **Fork** is the differentiator: a next line of treatment can quietly *close* the
door on a trial (a "no prior AKT inhibitor" exclusion, a "≤2 prior lines" cap). The patient picks
what their care team is weighing — the plausible next lines are **generated from their note**, not
typed in — or "Nothing decided yet" to see the whole decision tree. For each currently-open trial,
we **reuse its existing criterion ledger** (no re-reasoning) to judge **stays open / closes /
confirm**, always citing the driving criterion. Fail-closed like `/api/match`; every closing-door
view carries the required framing that this is *not* a reason to change a treatment plan. It reuses
the deterministic `enrollmentWindow` + proximity factors for the time-sensitivity line.

## Architecture

| Path | Role |
|------|------|
| `app/page.tsx` | The patient console — a client-side phase state machine that calls the routes between phases |
| `app/globals.css` | Design tokens (light default + dark) and all component styles |
| `app/api/extract` | `POST` note (or FHIR document) → structured profile + clarifying gaps, each field mCODE-mapped and provenance-tagged (Claude, structured output) |
| `app/api/upload-pdf` | `POST` PDF → extracted text for the same extract flow |
| `app/api/connect-records` | `GET` picker · `POST` pull one patient's chart via SMART on FHIR → provenance-delimited document |
| `app/api/trials` | `GET ?cond=` → normalized recruiting trials (ClinicalTrials.gov proxy) |
| `app/api/match` | `POST` profile → ranked trials with per-criterion ledgers (Claude, one call per trial) |
| `app/api/reconfirm` | `POST` re-judge open "confirm" criteria after the patient adds info (shared verdict rules) |
| `app/api/fork-options` | `POST` profile → plausible next treatment lines (Claude) + two fixed options in code |
| `app/api/fork` | `POST` a next treatment × open trials → stays-open / closes per trial, citing the criterion |
| `lib/fhir/client.ts` | SMART on FHIR R4 sandbox client — minimized resource pull, `DocumentReference`→`Binary`, compose |
| `lib/fhir/testPatients.ts` | Bundled mCODE R4 oncology test patients (carry the notes the open sandbox lacks) |
| `lib/ctgov.ts` | ClinicalTrials.gov v2 fetch + normalization |
| `lib/registries.ts` | Registry adapters + the multi-term union search (`searchExpanded`) |
| `lib/reason.ts` | The per-trial reasoning prompt and call — shared by the route and the eval harness |
| `lib/structuralGate.ts` | Age-band / sex gates decided in code from the registry's own structured fields |
| `lib/geo.ts` | Approximate proximity (city → state → neighboring state → country) + travel bands |
| `lib/factors.ts` | Deterministic decision factors: nearest **open** site, burden, registry freshness |
| `lib/verdict.ts` | The verdict meaning system, fail-closed status derivation, and the ranking comparator |
| `lib/schemas.ts` | Zod schemas that constrain Claude's structured output |
| `lib/anthropic.ts` | Anthropic client + pinned models |
| `evals/` | The eval harness — a deterministic suite and a model-tier scorecard |

### Getting records in (three entry paths)

A patient enters through any of three doors on Capture, all funneling into the same extractor:

1. **Paste / describe** — free text or a pasted note.
2. **Upload a PDF** — a visit summary or pathology report (`/api/upload-pdf`).
3. **Connect my medical records** — a real **SMART on FHIR R4** pull. Under the Cures Act
   (g)(10), the patient authorizes an app to pull their own chart; we retrieve only the resources
   we match on (data minimization), flatten structured resources **and** `DocumentReference` note
   narratives into one document, and read it with Claude. The demo runs against the public
   [SMART Health IT sandbox](https://launch.smarthealthit.org) (synthetic patients, no auth, zero
   real PHI) plus bundled mCODE oncology test patients.

The travel bands are honest about their own granularity. We place sites at city/state level with
no geocoder, so **"Local only"** means your state or your city and **"Within a few hours"** means
your state or one bordering it — not a mileage we cannot compute, and not (as it once did) the
whole country.

A **scope chip row** on the entry screen (study-type: treatment · tests · observational · expanded
access, plus travel band + ZIP) narrows the candidate set **before** the reasoning pass — the
study-type selection is applied server-side at ClinicalTrials.gov (`AREA[StudyType]` /
`AREA[DesignPrimaryPurpose]` on `filter.advanced`), so excluded studies never consume a Claude call.
It's collapsed by default with sensible defaults, adds zero steps, and travel only *ranks* (never
hard-filters). Study type is scope; it is not eligibility.

Every profile field is **mCODE / USCDI+ CTM mapped** (the federal cancer-trial-matching schema)
and carries a **provenance badge** — `FHIR` (structured chart data), `note` (read from a
narrative), or `you` (you told us / edited). The moat: FHIR reliably carries demographics,
conditions, receptors, meds; the decisive oncology variables (biomarkers, RECIST, washout dates,
line-of-therapy) live in the notes, and Claude is what turns those into a matchable profile.

### How matching works

`/api/match` is a four-stage funnel. Each stage exists to put the expensive stage's budget
where it does the most good.

**1 · Retrieve, across several terms.** `query.cond` is keyword matching, so a single term is a
hard ceiling on what can ever be found — a biomarker-selected basket study registers under
"advanced solid tumor", not "breast cancer", and is unreachable from the narrow term no matter
how good the downstream reasoning is. The extractor proposes 2–5 additional terms (a registry
synonym, the stage-qualified disease, the biomarker umbrella) and `searchExpanded()` unions and
de-duplicates them into one pool. When the patient set a travel preference, one extra
location-boosted leg is added. Every leg is **additive** — a leg can only add studies, and a leg
that fails is recorded and skipped rather than sinking the search. Recall lost here cannot be
recovered later, because nothing downstream can reason about a study it never saw.

**2 · Gate, in code.** ClinicalTrials.gov publishes `sex`, `minimumAge` and `maximumAge` as
structured fields. A 62-year-old cannot enter a study whose minimum age is 65, and no amount of
model reasoning changes that. `lib/structuralGate.ts` decides those two facts directly, so the
reasoning budget stops being spent rediscovering them from prose. The gate is deliberately timid:
it fires only when the patient's value is confidently known *and* the registry's value is
unambiguous, because a study wrongly dropped here would be invisible to the patient. Studies it
rules out are shown in their own section **with the reason**, never hidden.

**3 · Triage, cheaply.** Which studies get deep reasoning used to be decided by the registry's
own relevance ordering — which knows the search term and nothing about the patient. A Haiku pass
now scores each candidate 0–2 on plausibility. It is a **ranker, never a filter**: nothing is
dropped on its say-so, so a triage mistake costs a study its position, not its visibility, and a
triage failure falls back to registry order.

**4 · Reason, in depth.** Full per-criterion Claude reasoning over the top 10 (bounded
concurrency, one call per trial). Each trial's eligibility prose is segmented into atomic criteria
and each is judged **meets / clear / confirm / fails**. Trust invariants are enforced in code, not
left to the model:

- **Overall status is derived from the criteria (fail-closed)** — never a model's self-report.
- **"confirm" (insufficient info) is first-class** — a coordinator to-do, never guessed into a
  pass or a fail.
- **Every failure carries `remediable`** — a washout that will elapse reads differently from a
  prior therapy that cannot be undone. That is the difference between diarising a study and
  abandoning it, and the ruled-out list is sorted on it.
- **Ranking is over absolute, cross-trial-comparable counts** — status, then hard failures, then
  open items. Not a met/total ratio: the criteria are segmented by the model, so that denominator
  is an artifact of how finely one study's prose happened to split, and ordering on it penalised
  studies for being read carefully.
- Trials beyond the top 10 are shown as **"screened — not yet reasoned"**, never silently dropped.

Two registry facts are surfaced rather than assumed. A study can be `RECRUITING` while individual
sites are withdrawn or suspended, so proximity is computed over **open sites only** and a card
says so when none are open. And a record can sit at `RECRUITING` long after enrollment stopped, so
records untouched for ~6 months are flagged stale and ranked below fresh ones.

The tuning knobs (`PER_TERM_PAGE`, `CANDIDATE_POOL`, `TRIAGE_BATCH`, `DEEP_REASON_COUNT`,
`CONCURRENCY`) are named constants at the top of `app/api/match/route.ts`.

## Evaluation

```bash
npm run eval           # deterministic suite — no API key, no network
npm run eval:model     # scores the shipping prompt against gold cases (costs tokens)
```

**`npm run eval`** pins the layers that are decided in code: proximity bands and state adjacency,
the structural gates, nearest-**open**-site selection, registry staleness, fail-closed status
derivation, and the ranking comparator — including a case asserting that ranking does *not* move
when the same study is segmented into 8 criteria instead of 25.

**`npm run eval:model`** runs `lib/reason.ts` — the shipping prompt, not a copy — over the cases in
`evals/cases/` and reports a scorecard: status agreement, **false-eligible rate** (a patient told a
door is open when it is shut — the harmful direction, and the number to hold this to), false-
ineligible rate, whether a ruled-out study was ruled out for the *right* criterion, resistance to
an instruction planted in the patient record, and test-retest agreement across repeats
(`-- --repeats 3`). A false-eligible outcome exits non-zero.

> The gold expectations are authored, not clinically adjudicated. Until an oncologist or research
> nurse labels each case independently, this measures self-consistency and catches regressions —
> it is not an accuracy claim and not evidence of clinical validity. Standing that up is the
> prerequisite for any conversation with an IRB.

## Deploy to Vercel

1. Push to GitHub.
2. Import the repo in Vercel — it auto-detects Next.js at the root; no build config needed.
3. **Project → Settings → Environment Variables**: add `ANTHROPIC_API_KEY`.
4. Deploy. (ClinicalTrials.gov needs no key.)

The design system (palette, type, the criterion-ledger component, trust invariants) is documented
in `.claude/skills/design-system/`.

## License

MIT — see [LICENSE](LICENSE).
