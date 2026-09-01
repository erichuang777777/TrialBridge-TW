import { webMcpInspectorAcceptanceCases } from "./inspectorAcceptance.ts";
import { webMcpRuntimeAcceptanceChecks, webMcpRuntimeProbeName } from "./runtimeAcceptance.ts";

export interface WebMcpReceiptVerification {
  kind: "browser_runtime" | "manual_inspector";
  ok: boolean;
  errors: string[];
  metadataOnly: boolean;
  evidenceClass: "runtime_metadata" | "manual_self_attestation";
}

const publicToolNames = ["search_public_cancer_trials", "trialbridge_method"];
const forbiddenPayloadKey = /"(?:rawText|maskedText|medicalNote|confirmedProfile|profileFact|trialResult|prompt|toolArgument|toolOutput|content|thinking)"\s*:/i;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value].sort() : [];
}

function check(condition: boolean, message: string, errors: string[]) {
  if (!condition) errors.push(message);
}

function hasForbiddenPayload(value: unknown) {
  return forbiddenPayloadKey.test(JSON.stringify(value));
}

function validIsoInstant(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function validHttpOrigin(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
  } catch {
    return false;
  }
}

export function verifyWebMcpBrowserDiagnosticReceipt(value: unknown): WebMcpReceiptVerification {
  const errors: string[] = [];
  const receipt = record(value);
  const discovery = record(receipt.publicToolDiscovery);
  const headers = record(receipt.securityHeaders);
  const execution = record(receipt.safeExecution);
  const lifecycle = record(receipt.lifecycleAcceptance);
  const lifecycleChecks = Array.isArray(lifecycle.checks) ? lifecycle.checks.map(record) : [];
  const expectedLifecycleIds = webMcpRuntimeAcceptanceChecks.map((item) => item.id).sort();
  const receivedLifecycleIds = lifecycleChecks.map((item) => item.id).filter((id): id is string => typeof id === "string").sort();
  check(receipt.schemaVersion === "1.1", "schemaVersion must be 1.1.", errors);
  check(validIsoInstant(receipt.generatedAt), "generatedAt must be a valid UTC ISO instant.", errors);
  check(validHttpOrigin(receipt.origin), "origin must be an exact HTTP(S) origin.", errors);
  check(receipt.persistence === "download-only", "Receipt must be download-only.", errors);
  check(receipt.containsHealthInformation === false, "Receipt must declare no health information.", errors);
  check(receipt.browserState === "ready", "Browser runtime state must be ready.", errors);
  check(discovery.complete === true, "Public tool discovery must be complete.", errors);
  check(JSON.stringify(stringArray(discovery.expected)) === JSON.stringify(publicToolNames), "Expected public tools do not match the contract.", errors);
  check(JSON.stringify(stringArray(discovery.discovered)) === JSON.stringify(publicToolNames), "Discovered public tools do not match the contract.", errors);
  check(headers.permissionsPolicy === true && headers.openerPolicy === true && headers.noSniff === true, "All security-header checks must pass.", errors);
  check(execution.available === true && execution.state === "passed", "Safe trialbridge_method execution must pass.", errors);
  check(lifecycle.state === "passed", "Live lifecycle acceptance must pass.", errors);
  check(lifecycle.probeToolName === webMcpRuntimeProbeName, "Lifecycle probe name does not match the current contract.", errors);
  check(JSON.stringify(receivedLifecycleIds) === JSON.stringify(expectedLifecycleIds), "Lifecycle receipt check IDs do not match the current suite.", errors);
  check(lifecycleChecks.every((item) => item.status === "pass"), "Every live lifecycle check must pass.", errors);
  check(typeof lifecycle.toolchangeEvents === "number" && lifecycle.toolchangeEvents >= 2 && lifecycle.toolchangeEvents <= 99, "Lifecycle receipt must record register and cleanup toolchange events.", errors);
  check(lifecycle.containsHealthInformation === false && lifecycle.storesToolPayloads === false, "Lifecycle receipt must exclude health information and tool payloads.", errors);
  check(typeof receipt.evidenceBoundary === "string" && /does not prove/i.test(receipt.evidenceBoundary), "Runtime evidence boundary is missing.", errors);
  check(!hasForbiddenPayload(receipt), "Receipt contains a forbidden payload field.", errors);
  return { kind: "browser_runtime", ok: errors.length === 0, errors, metadataOnly: !hasForbiddenPayload(receipt), evidenceClass: "runtime_metadata" };
}

export function verifyWebMcpInspectorAcceptanceReceipt(value: unknown): WebMcpReceiptVerification {
  const errors: string[] = [];
  const receipt = record(value);
  const summary = record(receipt.summary);
  const cases = Array.isArray(receipt.cases) ? receipt.cases.map(record) : [];
  const expectedIds = webMcpInspectorAcceptanceCases.map((item) => item.id).sort();
  const receivedIds = cases.map((item) => item.id).filter((id): id is string => typeof id === "string").sort();
  check(receipt.schemaVersion === "1.0", "schemaVersion must be 1.0.", errors);
  check(validIsoInstant(receipt.generatedAt), "generatedAt must be a valid UTC ISO instant.", errors);
  check(validHttpOrigin(receipt.origin), "origin must be an exact HTTP(S) origin.", errors);
  check(Number.isInteger(receipt.chromeMajor) && (receipt.chromeMajor as number) >= 149 && (receipt.chromeMajor as number) < 1_000, "Chrome major version must be 149 or later.", errors);
  check(receipt.inspector === "Chrome Model Context Tool Inspector", "Inspector identity does not match the acceptance kit.", errors);
  check(receipt.artifactClass === "manual_inspector_self_attestation", "Artifact class must identify manual Inspector self-attestation.", errors);
  check(receipt.selfAttested === true && receipt.cryptographicallyVerified === false, "Manual evidence boundary must remain explicit.", errors);
  check(receipt.persistence === "download-only", "Receipt must be download-only.", errors);
  check(receipt.containsHealthInformation === false && receipt.storesPromptContent === false, "Receipt must exclude health information and prompt content.", errors);
  check(receipt.status === "complete_pass", "Every manual Inspector check must pass.", errors);
  check(summary.total === expectedIds.length && summary.completed === expectedIds.length && summary.passed === expectedIds.length && summary.needsAttention === 0 && summary.notRun === 0, "Manual summary must report every check passed.", errors);
  check(JSON.stringify(receivedIds) === JSON.stringify(expectedIds), "Manual receipt case IDs do not match the current acceptance kit.", errors);
  check(cases.every((item) => item.outcome === "pass"), "Every manual receipt case outcome must be pass.", errors);
  check(typeof receipt.evidenceBoundary === "string" && /does not by itself prove/i.test(receipt.evidenceBoundary), "Manual evidence boundary is missing.", errors);
  check(!hasForbiddenPayload(receipt), "Receipt contains a forbidden payload field.", errors);
  return { kind: "manual_inspector", ok: errors.length === 0, errors, metadataOnly: !hasForbiddenPayload(receipt), evidenceClass: "manual_self_attestation" };
}
