/* ============================================================================
   Trialign — the disclosure ledger shape (finding #8)

   There is no ledger backend. There is no database anywhere in this app (see
   D1 in docs/privacy-consent-audit.md, verified against the code) — and this
   file must not become the first exception. Adding a real write here would
   silently break the product's central privacy claim ("nothing you enter is
   stored") the moment someone imported this module.

   What exists instead is the SHAPE the write will take when a backend lands,
   plus the one call site (ReferralAuthorization in app/page.tsx) wired to it
   now. The point is structural: when a real ledger is built, the person
   wiring it finds a typed record already assembled and a function already
   named `recordDisclosure` at the exact place a disclosure actually happens —
   they cannot forget to call it, because it is already being called.

   P5 (access-export must list every third party disclosed to — this cannot
   be reconstructed later from anything else in the app) and P3 (authorization
   mechanics: signature, validity, retention, and — if ever compensated — the
   fact that compensation makes this a *sale* requiring a signed authorization
   rather than a consent card) both fail today for the same underlying reason:
   nothing durable records a disclosure when one happens. This file does not
   fix that — only a real backend can — but it makes the fix impossible to
   omit by accident.

   A real `recordDisclosure` must guarantee, at minimum:
     - append-only: no update/delete path, ever — a ledger you can edit is not
       an audit trail;
     - tamper-evident ordering: each entry chained to the one before it (a hash
       chain or an equivalent) so a gap or a reorder is detectable, not just
       "trust the timestamp column";
     - retention honored *and* enforced: an authorization's retainUntil is a
       floor and a ceiling both — the record must survive at least that long
       and a real deletion/expiry job must exist for entries past it, not just
       a field nobody reads.
   ========================================================================== */

/** One field disclosed, keyed the same way the profile already carries it
 *  (ProfileField in app/page.tsx and the fixtures both satisfy this shape
 *  structurally — no adapter needed). */
export type DisclosureField = { label: string; value: string };

/** Compensation is answered, never defaulted. A boolean with an optional
 *  purchaser would let a caller silently skip the question by omission; this
 *  shape makes "no" and "yes, and here's who paid" the only two ways to fill
 *  it in. P3: if a referral is ever compensated, the disclosure is a *sale*
 *  under MHMD and requires a signed authorization naming the purchaser — not
 *  the consent-card flow this app runs today. Nothing in this codebase pays
 *  for referrals; every real call site must still pass `{ compensated: false }`
 *  explicitly so that changes, if they happen, show up as a diff on this line. */
export type Compensation = { compensated: false } | { compensated: true; purchaser: string; amount?: string };

/** How the authorization was captured. "clickthrough" is the honest name for
 *  what this app does today — a button press — not a signature in the legal
 *  sense. Naming it explicitly (rather than calling it "signature") keeps the
 *  type from overclaiming what the UI actually captures. */
export type SignatureMethod = "clickthrough";

export type Signature = {
  method: SignatureMethod;
  /** ISO 8601 timestamp of the authorizing action itself. */
  capturedAt: string;
};

/** P3's authorization mechanics, typed rather than left as prose on the
 *  referral card. `id` is the same value as DisclosureRecord.authorizationId
 *  — an authorization and the disclosure it licenses are one referral, one
 *  record, so they share an id instead of needing a join. */
export type Authorization = {
  id: string;
  signature: Signature;
  /** ISO 8601. Authorization starts the moment it's captured. */
  validFrom: string;
  /** ISO 8601, validFrom + ONE_YEAR_MS — P3's stated validity window. */
  validUntil: string;
  /** ISO 8601, validFrom + SIX_YEARS_MS — P3's stated retention floor. This is
   *  a minimum the record must survive, not a target to delete it at. */
  retainUntil: string;
};

/** What P5 (access-export must list every third party disclosed to) and P3
 *  together require of one disclosure event. */
export type DisclosureRecord = {
  authorizationId: string;
  recipient: {
    sponsor: string;
    site: string;
    nctId: string;
  };
  /** Field LABELS only, derived from what was actually shared — never a
   *  hardcoded list, so a record can never claim to disclose less than it did. */
  fieldsDisclosed: string[];
  /** The profile fields are only half of what leaves. The pre-screen packet the
   *  coordinator receives (PacketB in app/page.tsx) also carries the
   *  criterion-by-criterion assessment, and each criterion's `evidence` quotes
   *  the patient's own record back. A record listing only `fieldsDisclosed`
   *  would describe a narrower disclosure than the one that happened — which is
   *  the P5 gap this file exists to close, not a detail. Counts, not contents:
   *  the ledger records THAT the assessment was disclosed and how much of it
   *  quoted the record, without becoming a second copy of the health data. */
  criteriaDisclosed: { count: number; quotingRecord: number };
  purpose: string;
  /** ISO 8601 timestamp of the disclosure itself. */
  timestamp: string;
  authorization: Authorization;
  compensation: Compensation;
};

function toIso(now: Date | number): string {
  return (now instanceof Date ? now : new Date(now)).toISOString();
}

/** Anniversary arithmetic, not `n * 365 days`. Retention is a floor: six
 *  365-day years land ~1.5 days BEFORE the six-year anniversary, so the fixed
 *  multiple errs on the side of holding the record too briefly — the one
 *  direction a floor must never err in. Calendar years also make the stated
 *  term ("six years from today") and the stored value the same claim. */
function addYears(now: Date | number, years: number): string {
  const d = new Date(now instanceof Date ? now.getTime() : now);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString();
}

/** Assembles the disclosure record a real referral would need to write.
 *  Pure and deterministic given its inputs — `now` and `authorizationId` are
 *  passed in rather than sourced from `Date.now()` / `crypto.randomUUID()`
 *  internally, precisely so this function is testable without mocking
 *  globals. The id itself is fine to generate with `crypto.randomUUID()` at
 *  the call site (see recordDisclosure's caller in app/page.tsx) — nothing
 *  about minting a random id, unlogged, is itself a persistence write. */
export function buildDisclosureRecord(input: {
  authorizationId: string;
  fields: DisclosureField[];
  /** The criteria that travel with the packet. Required, not optional: the
   *  assessment leaves with the referral, so a call site that forgets it would
   *  under-report the disclosure — the failure this record exists to prevent.
   *  Structural, so `Criterion` satisfies it without an adapter. */
  criteria: { evidence?: string }[];
  sponsor: string;
  site: string;
  nctId: string;
  purpose: string;
  compensation: Compensation;
  now: Date | number;
}): DisclosureRecord {
  const timestamp = toIso(input.now);

  return {
    authorizationId: input.authorizationId,
    recipient: {
      sponsor: input.sponsor,
      site: input.site,
      nctId: input.nctId,
    },
    fieldsDisclosed: input.fields.map((f) => f.label),
    criteriaDisclosed: {
      count: input.criteria.length,
      quotingRecord: input.criteria.filter((c) => (c.evidence ?? "").trim() !== "").length,
    },
    purpose: input.purpose,
    timestamp,
    authorization: {
      id: input.authorizationId,
      signature: { method: "clickthrough", capturedAt: timestamp },
      validFrom: timestamp,
      validUntil: addYears(input.now, 1),
      retainUntil: addYears(input.now, 6),
    },
    compensation: input.compensation,
  };
}

/** What happened to a disclosure record after `recordDisclosure` ran. The two
 *  variants exist so a future caller can never mistake "there is no backend"
 *  for "the write succeeded" — the discriminant is `persisted`, not the
 *  absence of a thrown error. */
export type DisclosureOutcome =
  | { persisted: true; authorizationId: string }
  | { persisted: false; reason: "no_ledger_backend_configured"; record: DisclosureRecord };

/** The (future) transmit-point sink. Today this performs no write of any
 *  kind — no fs, no fetch, no localStorage, no module-level array that
 *  outlives the call — because there is no ledger backend to write to and
 *  this app's entire privacy posture depends on that staying true (D1: zero
 *  persistence, verified against the code) until a backend is deliberately
 *  built and reviewed.
 *
 *  It never throws: authorizing a referral in the demo must keep working
 *  exactly as before. It is loud only in its return SHAPE — `persisted:
 *  false` with a named reason — so a caller that ignores the outcome is the
 *  one place a future silent gap could hide, not this function. */
export function recordDisclosure(record: DisclosureRecord): DisclosureOutcome {
  return { persisted: false, reason: "no_ledger_backend_configured", record };
}
