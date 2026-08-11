# Decision support — design rationale

This note explains the decision-support layer added to Trial's results screen, and the
thinking behind it. It answers a piece of product feedback:

> "How do we make the decision-making process feel *satisfying*? This is a big decision for
> the people involved. How can we make risks and benefits feel clearer, and give the patient
> agency?"

## The problem

Before this change, Trial answered **eligibility** — *does this patient qualify?* — as a ranked
list of trials, each with a criterion ledger (meets / clear / confirm / fails). That's the
trust surface, and it's good at what it does. But it stopped there. A coordinator saw a list of
qualifying trials with no help *weighing* them, the patient wasn't in the loop, and a single
trial's reasoning was a long, flat wall of criteria — testers said they didn't know where to
look first.

Choosing a trial is one of the highest-stakes decisions a patient makes. Eligibility is the
floor, not the product. The decision-support layer sits on top of the eligibility engine and
helps a patient, with their care team, actually *weigh and choose*.

## What we added

**1. A patient-facing decision brief (per trial).**
For every trial the patient could join, three plain-language blocks:

- **Could offer** — what the trial is studying / could offer, framed as *potential*, phase-aware.
- **Asks of you** — the real commitment: randomization or placebo possibility, visits and
  procedures, travel to the nearest site, study length.
- **Still uncertain** — what's experimental or unknown, appropriate to the phase.

Plus **2–3 questions to bring to the care team**, drawn from the trial's open items (the
`confirm` criteria) and its uncertainties. This turns "insufficient info" from a dead end into
an action the patient owns.

**2. Preference controls — the agency lever.**
A row of toggles — *Stay near home · Established science · Avoid randomization/placebo · Lower
burden* — lets the patient/coordinator re-rank by what *they* value. The list reorders and each
card annotates *why* it moved ("moved up: open-label, no randomization"). Off by default. This
is agency made concrete: the ordering reflects the patient's priorities, not just a score.

**3. A "to discuss" shortlist.**
The patient stars trials to build their own takeaway — the artifact they walk into the
appointment with.

**4. Information hierarchy on each card.**
The card now leads with the brief (plain language — *look here first*), then an at-a-glance
factor row, then the questions. The **eligibility ledger is collapsed behind an accordion**
with a summary tally (`5 met · 4 to confirm · 2 not met`). Opened, it's **grouped by verdict**
(To confirm → Not met → Met) and **filterable** by tally chip — so the actionable calls surface
first instead of a flat list. Ruled-out trials open the ledger by default, because *why not* is
the point there.

**5. Plain-language glosses on the ledger itself.** design.md §9 requires clinical terms to be
paired with a plain-language gloss; the clarification cards already did this and the ledger — the
product's signature surface — didn't. Each criterion now carries a `gloss`: a short, ~8th-grade
"what does this mean?" explanation of any clinical term in its requirement, tucked behind the same
quiet disclosure pattern as the clarification cards, collapsed by default so it never competes with
the requirement or the verdict. It's descriptive only — set by the model alongside `provenance` and
`remediable`, never touching a verdict or the derived status — and it renders only for patient and
caregiver readers; a clinician's ledger stays exactly as dense as before.

## How risk/benefit stays honest

The brief is **grounded only in real trial attributes** pulled live from ClinicalTrials.gov —
phase, study type (interventional vs observational), randomization and masking, primary
purpose, interventions, and site locations — plus the eligibility findings. It never invents
efficacy or outcomes. It is explicitly **phase-honest**: a Phase 1 study is described as testing
safety and dosing with benefit unproven; an observational study as contributing data with no
treatment. The model is instructed, in the system prompt, never to promise benefit and never to
tell the patient what to choose.

## Trust guardrails (non-negotiable)

- **Non-directive.** Nothing is labelled "best" or "recommended." The tool frames the decision;
  the patient and care team make it. The summary and disclaimer say so plainly.
- **Ranking stays explainable.** Preference re-ranking runs over **deterministic factors computed
  in code** (phase rank, proximity, randomization, a rough burden proxy) — never a model's
  self-reported confidence. Every reorder shows its reason.
- **The eligibility ledger is preserved**, one click away on every card. The decision brief is
  supporting structure; the sourced criterion reasoning remains the signature and the evidence.
- **Overall status is still derived from the criteria, fail-closed.** A near-miss lists every
  failing criterion.
- **Disclaimer + agency framing** stay visible: *informational decision support for review with a
  care team — not medical advice, and it does not choose for you.*

## What's approximate / out of scope

- **Proximity** is an approximate city/state match against the patient's stated location, not a
  geocoded distance — and it's labelled as such in the UI. It now resolves *neighboring states*
  as their own band, so "within a few hours" no longer quietly means "anywhere in the country."
- **Burden** is a rough estimate from study type and phase, surfaced honestly.
- **Registry freshness** is a proxy, not a fact: a stale record may still be enrolling and a
  fresh one may not be. It is shown as an age, never as a status.
- An **eval harness** now exists (`npm run eval` / `npm run eval:model`, see the README), but its
  gold expectations are authored rather than clinically adjudicated. It catches regressions; it
  is not evidence of clinical validity.
- Still not addressed: **HIPAA / compliance** readiness (the existing privacy audit explicitly
  covers FTC/MHMD and *not* HIPAA), audit logging, and deep **clinical-workflow** integration.

## Ranking: what changed and why

The results list used to order trials by `metCount / total`. That ratio is not comparable across
trials — the criteria are segmented by the model, so one study yields 8 atomic requirements and
another yields 25 from prose of the same substance. A study that happened to be split finely
ranked below one split coarsely, purely as an artifact of segmentation. It looked like a score
and behaved like a bug.

Ranking is now lexicographic over quantities that mean the same thing everywhere: status, then
**hard failures** (fixed for this patient), then **open items** (the coordinator's actual
workload), then remediable failures, then registry staleness. Every term is a code-derived count
or a registry date. None of it is a model's self-reported confidence — the invariant this layer
existed to protect in the first place.

The `remediable` flag on each criterion is what makes "ruled out" legible: a washout that will
elapse is a *not yet*, an irreversible prior therapy is a *no*, and a coordinator triages those
two piles completely differently. It is descriptive — it never changes a verdict or a status.
