# Roadmap — what the patient still needs, what the clinician still needs

Written after the matching-pipeline and clinician-IA work landed. It records what is
being built now, what is deliberately deferred, and — for the deferred items — what
decision has to be made before they *can* be built.

The organising observation: several of the highest-value gaps are not missing
capabilities. They are data the app already fetches, normalizes, and then drops. The
same pattern that hid `sex`/`minimumAge`/`maximumAge` from the gates and hid site
recruiting status from the proximity calculation is still hiding two more things.

---

## Now — patient

### P1 · "Not open to you yet" — remediable near-misses get their own section

For a patient in later-line disease, **zero fully-eligible trials is the normal
result**. Today that is where the product goes quiet: `NextStepsPanel` says "No
fully-eligible trials yet" and stops. It is the moment the patient most needs help
and the screen has least to say.

But the information already exists. Every failing criterion carries `remediable` — a
washout that will elapse is a *not yet*; an irreversible prior therapy is a *no* — and
`hardFailCountOf()` already separates the two. A trial whose every failure is
remediable is categorically different from one the patient can never enter, and
today they sit in the same collapsed "Ruled out" pile.

Split the pile. A section above the ruled-out list, holding the trials with **no hard
failures**, leading with what would have to change.

**Honesty constraint.** "Could change" is not "will open", and a criterion that could
change is not a plan. The copy frames possibility, never expectation, and never tells
the patient to wait for something. This is the same non-directive rule the decision
brief already lives under.

Not a new `MatchStatus` — a presentation split, so the bucket counts still reconcile
to the pool total.

### P2 · Per-site contacts — fetched, normalized, never rendered

`lib/ctgov.ts` normalizes each location's own coordinator contacts into
`TrialLocation.contacts`. Nothing renders them. The referral screen shows the
*central* study contacts plus a list of site names — so a patient ready to phone gets
the sponsor's switchboard, not the coordinator at the hospital they would actually
attend.

Render them, nearest site first, and mark sites whose own status is not recruiting
(the predicate already exists as `siteIsRecruiting`).

### P3 · Plain-language gloss on the criterion ledger

`design.md` §9: *"Clinical terms always paired with a plain-language gloss."* The
clarification cards honour this — `ClarificationSchema` carries `gloss`. The criterion
ledger does not, and the ledger is what the product calls its signature. A patient
reads "Measurable disease per RECIST v1.1" with no explanation anywhere.

Add `gloss` to the ledger criterion, shown for patient and caregiver readers and
suppressed for clinicians, who do not need it and whose page is already dense.

### P4 · Caregiver gets an information architecture, not just pronouns

Exactly the gap the clinician view had until recently: `caregiver` changes "you" to
"your loved one" and nothing else. But a caregiver's job is not the patient's job.
The patient is deciding whether they want the trial. The caregiver is working out
whether it is *doable* — how far, how often, who drives, who calls, what to bring.

Promote the logistics the app already computes deterministically (nearest open site,
whether it is in the stated travel band, burden proxy, enrollment window) into a
first-class row for that reader. Invent nothing: no visit counts, no travel times,
nothing that is not already in `DecisionFactors`.

---

## Now — clinician

### C1 · Cohort screening: turn the arrow around

The product runs **patient → trials**. A coordinator's actual daily job is
**trial → patients**: *"this study is open — who on today's list might fit?"*

The engine transfers directly (criteria segmentation is patient-independent and
already cacheable in principle), but the entry point, the request shape and the
output are all new: one NCT id plus N profiles in, a matrix out — per patient, the
derived status, the open items, and the hard failures.

It needs no persistence: the same in-memory posture as today, one request in, one
result out. That matters, because it means this can ship without first resolving the
storage question below.

Shipped in two parts — engine and API first (self-contained, testable without a
browser), then the clinician-facing screen. **Both parts have landed:**
`app/api/screen/route.ts` and `/screen`, with a curated sample cohort so the
matrix can be exercised without an API key, and a CSV export of the matrix
(`lib/cohortCsv.ts`). The wire contract lives in `lib/screenTypes.ts`, which the
route imports rather than restates — a route module may only *export* handlers,
but it may import anything, so there is one definition and one `MAX_COHORT`.

`/screen` is a fourth ingest path, so it carries the same `DemoGate` and DEMO
badge as the patient side (audit findings #1 and #6) — the component moved to
`app/components/DemoGate.tsx` for that reason. A coordinator's list is 25 notes
rather than one, which makes it the surface where an ungated paste would matter
most, not least.

---

## Deferred, and why

These are not lower value. They are blocked on a decision that is not a
developer's to make.

### Blocked on the persistence decision

Zero persistence is currently a genuine strength — the privacy audit verified it, and
it is why the app can honestly say nothing is stored. It is also what makes four
things impossible:

| Want | Why it needs storage |
|---|---|
| **Time axis for patients** ("what changed since last month") | Requires last month's result to compare against. The marketing thesis is that doors close; the product takes one photograph. |
| **Criteria-change tracking for coordinators** | Protocol amendments change eligibility. `registryStale` answers "how old is this record", not "which criterion moved since you last screened this patient" — the latter needs the prior snapshot. |
| **Screening-failure feedback loop** | A coordinator learns, post-screening, that a patient actually failed on X. That is the single most valuable input the eval harness lacks — it is how the gold set stops being *authored* and starts being *clinically adjudicated*. Nowhere to put it today. |
| **Audit trail** | "Who looked at which patient, when, and saw what" is a hard requirement for clinical deployment, and is audit finding #8 (disclosure ledger). Zero persistence is a demo virtue and a clinical defect. |

**The decision:** whether Trialign keeps zero persistence and stays a demo/consumer
tool under FTC/MHMD framing, or takes on storage — and with it consent records,
retention, access control and audit logging — to become deployable in a clinic.
That is a product and legal posture call. Everything in this block follows from it.

### Blocked on a data/dependency decision

**Geocoded distance.** Proximity is city/state matching. "Within a few hours" now
honestly resolves to *your state or one bordering it*, which is the best statement
available without coordinates — but the question a patient is actually asking is
*"can I drive there?"*, and that needs real distance. Two routes, both with a cost:

- Embed a ZIP-centroid table (~33k rows, ≈1 MB) — no runtime dependency, no network,
  but it is a data file to carry and keep current.
- Use ClinicalTrials.gov's own `filter.geo=distance(lat,lon,50mi)` — accurate and
  server-side, but it needs the patient's coordinates, so it still needs a geocoder
  for the ZIP they typed.

This is the single highest-impact remaining factor in whether a patient actually
enrolls, and it is a dependency call rather than an engineering problem.

### Deferred on scope

**Structured clinical input for the coordinator.** ECOG, stage, labs and prior lines
are already structured in a coordinator's hands; making them retype prose so a model
can re-extract it is backwards. Worth doing, but it is an intake redesign and should
follow C1 — the cohort screen is where the shape of that input will become obvious.

**Batch export beyond one patient.** ~~The screening log is per-patient plain text. A
multi-patient matrix (CSV) belongs with C1, not before it.~~ **Done** — shipped with
C1 as `lib/cohortCsv.ts`. Like the per-patient log, the file qualifies itself: a
download outlives the screen that framed it, so it carries the
not-an-eligibility-determination line, says when it came from the sample cohort,
and states the registry record's status and age — which is exactly what cannot be
recovered from the file later.

---

## Invariants — unchanged by any of the above

Nothing here is permitted to weaken these. They are the product.

- **Status is derived from the criteria, in code.** Never read off a model's
  self-report. `deriveStatus()` is the only thing that decides.
- **Fail-closed.** A near-miss lists *every* failing criterion, not the first.
- **`confirm` is a real answer.** Insufficient information is never guessed into a
  pass or a fail.
- **Non-directive.** Nothing is "best" or "recommended". The tool frames the
  decision; the patient and their care team make it.
- **Ranking is explainable.** Code-derived counts and registry dates only.
- **Reader changes the page, never the verdict.** Patient, caregiver and clinician
  see the same eligibility findings in a different order.
- **Nothing is silently dropped.** Excluded, ruled out and not-yet-reasoned studies
  are all shown, with the reason.
