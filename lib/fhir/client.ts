/* ============================================================================
   Trialign — SMART on FHIR R4 sandbox client

   The record-import moat (record-import-prd.md): the patient pulls their own
   chart through the Cures Act (g)(10) FHIR API, and Claude turns the documents
   into a matchable profile. This module is the "rented connection" half — it
   pulls a patient's resources and flattens them into a provenance-delimited
   text document that /api/extract reads.

   Two sources share the SAME normalization path (`composeDocument`):
   - LIVE: the public SMART Health IT open sandbox (real FHIR R4, synthetic
     patients, no auth, zero real PHI). Demo-mode guardrail (PRD §8): we only
     ever point at the sandbox base, never a production EHR endpoint.
   - BUNDLED: local mCODE R4 oncology test patients (lib/fhir/testPatients.ts),
     which carry the DocumentReference notes the open sandbox lacks.

   Data minimization (PRD §8 / consent-flow-spec §3): we fetch ONLY the resource
   types we match on and discard the rest at ingest — we never pull $everything.
   ========================================================================== */

/** The SMART Health IT open R4 endpoint. Overridable, but defaults to the
 *  sandbox — never a live production EHR (demo-mode guardrail). */
export const FHIR_BASE =
  process.env.SMART_FHIR_BASE?.replace(/\/+$/, "") || "https://launch.smarthealthit.org/v/r4/fhir";

/* ---- minimal FHIR R4 shapes (only the fields we read) ---- */
type Coding = { system?: string; code?: string; display?: string };
type CodeableConcept = { text?: string; coding?: Coding[] };
type Quantity = { value?: number; unit?: string; comparator?: string };
type Reference = { reference?: string; display?: string };

export type FhirResource = {
  resourceType: string;
  id?: string;
  // Patient
  name?: { family?: string; given?: string[]; text?: string }[];
  gender?: string;
  birthDate?: string;
  address?: { postalCode?: string; city?: string; state?: string }[];
  // Condition / Observation / DiagnosticReport / DocumentReference
  code?: CodeableConcept;
  category?: CodeableConcept[];
  clinicalStatus?: CodeableConcept;
  onsetDateTime?: string;
  effectiveDateTime?: string;
  issued?: string;
  valueQuantity?: Quantity;
  valueCodeableConcept?: CodeableConcept;
  valueString?: string;
  conclusion?: string;
  // Medication*
  medicationCodeableConcept?: CodeableConcept;
  status?: string;
  authoredOn?: string;
  // DocumentReference
  type?: CodeableConcept;
  date?: string;
  content?: { attachment?: { contentType?: string; data?: string; url?: string; title?: string } }[];
  subject?: Reference;
};

export type PatientSummary = { id: string; label: string; summary: string };

export type ComposedRecord = {
  document: string;
  meta: {
    patientLabel: string;
    counts: { conditions: number; observations: number; medications: number; reports: number; notes: number };
    /** true when a note narrative was actually resolved (the moat has material to read). */
    hasNotes: boolean;
    /** honest signal for the live path: no structured oncology condition found. */
    oncologyStructured: boolean;
  };
};

/* The resource types we match on — the entire data-minimization allow-list.
   Anything else the chart holds is never requested. */
const PULL_TYPES = [
  "Condition",
  "Observation",
  "MedicationRequest",
  "MedicationAdministration",
  "DiagnosticReport",
  "DocumentReference",
] as const;

/* ---------------------------------------------------------------- live fetch */

async function fhirGet(path: string): Promise<unknown> {
  const res = await fetch(`${FHIR_BASE}/${path}`, {
    headers: { Accept: "application/fhir+json" },
    // sandbox is public + read-only; no caching of PHI-shaped responses
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`FHIR ${path} → ${res.status} ${res.statusText}`);
  return res.json();
}

function bundleResources(bundle: unknown): FhirResource[] {
  const entries = (bundle as { entry?: { resource?: FhirResource }[] })?.entry ?? [];
  return entries.map((e) => e.resource).filter((r): r is FhirResource => !!r && !!r.resourceType);
}

function patientLabel(p: FhirResource | undefined): string {
  const n = p?.name?.[0];
  if (!n) return p?.id ? `Patient ${p.id}` : "Patient";
  if (n.text) return n.text;
  return [n.given?.join(" "), n.family].filter(Boolean).join(" ") || `Patient ${p?.id ?? ""}`.trim();
}

/** List a handful of live sandbox patients for the connect picker. */
export async function listPatients(count = 8): Promise<PatientSummary[]> {
  const bundle = await fhirGet(`Patient?_count=${count}`);
  const patients = bundleResources(bundle).filter((r) => r.resourceType === "Patient");
  return patients.map((p) => {
    const bits = [p.gender, p.birthDate ? `b. ${p.birthDate}` : "", p.address?.[0]?.state]
      .filter(Boolean)
      .join(" · ");
    return { id: p.id ?? "", label: patientLabel(p), summary: bits };
  });
}

/** True when `url` lives on the same scheme+host+port as the configured FHIR
 *  base. An unparseable URL is not same-origin — unknown is not permission. */
function sameOrigin(url: string, base: string): boolean {
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

/** Resolve a DocumentReference's narrative to plain text. Handles inline base64
 *  (`attachment.data`) and, for the live path, a `Binary`/URL reference. */
async function resolveNarrative(doc: FhirResource, allowNetwork: boolean): Promise<string> {
  for (const c of doc.content ?? []) {
    const att = c.attachment;
    if (!att) continue;
    const ct = att.contentType ?? "";
    if (att.data) return decodeAttachment(att.data, ct);
    if (att.url && allowNetwork) {
      try {
        const url = att.url.startsWith("http") ? att.url : `${FHIR_BASE}/${att.url.replace(/^\/+/, "")}`;
        // `attachment.url` is a value from the FHIR server's response, not from
        // us. Fetching it verbatim would let whoever controls that server point
        // this process at any host it can reach — a link-following bug that
        // becomes SSRF the moment FHIR_BASE is a real EHR rather than a public
        // sandbox. Narratives may only be resolved from the server we asked.
        if (!sameOrigin(url, FHIR_BASE)) continue;
        const res = await fetch(url, { headers: { Accept: "*/*" }, cache: "no-store" });
        if (!res.ok) continue;
        const raw = await res.text();
        // A Binary resource may come back as FHIR JSON with base64 `data`.
        if ((res.headers.get("content-type") ?? "").includes("json")) {
          try {
            const b = JSON.parse(raw) as { data?: string; contentType?: string };
            if (b.data) return decodeAttachment(b.data, b.contentType ?? ct);
          } catch {
            /* not JSON after all — fall through to raw */
          }
        }
        return stripMarkup(raw, ct);
      } catch {
        /* unreachable narrative — degrade gracefully */
      }
    }
  }
  return "";
}

function decodeAttachment(b64: string, contentType: string): string {
  try {
    const text = Buffer.from(b64, "base64").toString("utf8");
    return stripMarkup(text, contentType);
  } catch {
    return "";
  }
}

function stripMarkup(text: string, contentType: string): string {
  const t = contentType.includes("html") || /^\s*</.test(text) ? text.replace(/<[^>]+>/g, " ") : text;
  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ---------------------------------------------------- normalization / compose */

function conceptText(c: CodeableConcept | undefined): string {
  return c?.text || c?.coding?.find((x) => x.display)?.display || c?.coding?.[0]?.code || "";
}
function obsValue(o: FhirResource): string {
  if (o.valueQuantity) {
    const q = o.valueQuantity;
    // round Synthea's long floats to something a note would actually carry
    const v = typeof q.value === "number" ? Math.round(q.value * 100) / 100 : q.value ?? "";
    return `${q.comparator ?? ""}${v} ${q.unit ?? ""}`.trim();
  }
  if (o.valueCodeableConcept) return conceptText(o.valueCodeableConcept);
  if (o.valueString) return o.valueString;
  return "";
}

/* Keep the composed document lean: a real chart can carry hundreds of routine
   observations; cap the noisiest sections so extraction stays focused + cheap. */
const MAX_OBSERVATIONS = 50;
const MAX_MEDS = 40;

/** "1964-03-12" → "age 62". Returns null when the date is absent or unparseable
 *  — an unreadable birth date is simply not reported, never approximated. */
function ageFromBirthDate(birthDate?: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((birthDate ?? "").trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  const hadBirthday = now.getUTCMonth() + 1 > mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() >= d);
  if (!hadBirthday) age -= 1;
  return age >= 0 && age <= 120 ? `age ${age}` : null;
}

/** Flatten a patient's resources into one provenance-delimited text document.
 *  Section headers ("STRUCTURED FHIR DATA" / "CLINICAL NOTES") are how the
 *  extractor assigns each field's `source` (fhir vs note). */
export async function composeDocument(resources: FhirResource[], allowNetwork: boolean): Promise<ComposedRecord> {
  const patient = resources.find((r) => r.resourceType === "Patient");
  const conditions = resources.filter((r) => r.resourceType === "Condition");
  const observations = resources.filter((r) => r.resourceType === "Observation");
  const meds = resources.filter((r) => r.resourceType === "MedicationRequest" || r.resourceType === "MedicationAdministration");
  const reports = resources.filter((r) => r.resourceType === "DiagnosticReport");
  const docRefs = resources.filter((r) => r.resourceType === "DocumentReference");

  const structured: string[] = [];
  if (patient) {
    // Age, not date of birth. Nothing downstream matches on a birth date — age
    // bands are what eligibility criteria are written in — so sending the DOB
    // would put a direct identifier into a third-party API call to buy nothing.
    // (The patient's NAME is likewise kept out of this document; it stays in
    // meta.patientLabel, which never leaves the picker UI.) ZIP-only for
    // location, which is already the discipline everywhere else.
    const demo = [
      patient.gender,
      ageFromBirthDate(patient.birthDate) ?? "",
      patient.address?.[0]?.postalCode ? `ZIP ${patient.address[0].postalCode}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    if (demo) structured.push(`Demographics: ${demo}`);
  }
  for (const c of conditions) {
    const name = conceptText(c.code);
    if (!name) continue;
    const extra = [c.onsetDateTime ? `onset ${c.onsetDateTime}` : "", conceptText(c.clinicalStatus)].filter(Boolean).join(", ");
    structured.push(`Condition: ${name}${extra ? ` (${extra})` : ""}`);
  }
  let obsShown = 0;
  for (const o of observations) {
    if (obsShown >= MAX_OBSERVATIONS) break;
    const name = conceptText(o.code);
    const val = obsValue(o);
    if (!name || !val) continue;
    structured.push(`Observation: ${name} = ${val}${o.effectiveDateTime ? ` (${o.effectiveDateTime})` : ""}`);
    obsShown++;
  }
  if (observations.length > obsShown) structured.push(`(+${observations.length - obsShown} more observations not shown)`);
  for (const m of meds.slice(0, MAX_MEDS)) {
    const name = conceptText(m.medicationCodeableConcept);
    if (!name) continue;
    const when = m.authoredOn ? ` (${m.authoredOn})` : "";
    structured.push(`Medication: ${name}${m.status ? ` — ${m.status}` : ""}${when}`);
  }
  for (const r of reports) {
    const name = conceptText(r.code);
    if (name) structured.push(`DiagnosticReport: ${name}${r.conclusion ? ` — ${r.conclusion}` : ""}`);
  }

  // Resolve the narratives — this is the moat's raw material (§5).
  const notes: string[] = [];
  for (const d of docRefs) {
    const text = await resolveNarrative(d, allowNetwork);
    if (!text) continue;
    const kind = conceptText(d.type) || "Clinical note";
    const when = d.date ? ` · ${d.date}` : "";
    notes.push(`[${kind}${when}]\n${text}`);
  }

  const parts: string[] = [];
  parts.push("=== STRUCTURED FHIR DATA (certified EHR via SMART on FHIR R4) ===");
  parts.push(structured.length ? structured.join("\n") : "(no structured clinical resources returned for this patient)");
  parts.push("");
  parts.push("=== CLINICAL NOTES (DocumentReference → Binary narratives) ===");
  parts.push(notes.length ? notes.join("\n\n") : "(no clinical-note documents available for this patient)");

  const oncologyStructured = conditions.some((c) => /cancer|neoplasm|carcinoma|tumou?r|malignan/i.test(conceptText(c.code)));

  return {
    document: parts.join("\n"),
    meta: {
      patientLabel: patientLabel(patient),
      counts: {
        conditions: conditions.length,
        observations: observations.length,
        medications: meds.length,
        reports: reports.length,
        notes: notes.length,
      },
      hasNotes: notes.length > 0,
      oncologyStructured,
    },
  };
}

/** Live pull: fetch the minimized resource set for one sandbox patient, then compose. */
export async function pullLivePatient(id: string): Promise<ComposedRecord> {
  const patientBundle = await fhirGet(`Patient/${encodeURIComponent(id)}`);
  const patient = patientBundle as FhirResource;
  const resources: FhirResource[] = patient?.resourceType === "Patient" ? [patient] : [];

  const searches = await Promise.all(
    PULL_TYPES.map(async (type) => {
      try {
        return bundleResources(await fhirGet(`${type}?patient=${encodeURIComponent(id)}&_count=100`));
      } catch {
        return [] as FhirResource[]; // one resource type failing must not sink the pull
      }
    }),
  );
  for (const list of searches) resources.push(...list);

  return composeDocument(resources, /* allowNetwork */ true);
}
