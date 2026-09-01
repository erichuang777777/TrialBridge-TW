import assert from "node:assert/strict";
import test from "node:test";
import {
  createWebMcpInspectorAcceptanceReceipt,
  webMcpInspectorAcceptanceCases,
} from "../lib/webmcp/inspectorAcceptance.ts";

test("Inspector acceptance kit covers the manual Chrome evidence boundary", () => {
  assert.equal(webMcpInspectorAcceptanceCases.length, 6);
  assert.equal(new Set(webMcpInspectorAcceptanceCases.map((item) => item.id)).size, 6);
  assert.equal(webMcpInspectorAcceptanceCases.some((item) => item.category === "Discovery"), true);
  assert.equal(webMcpInspectorAcceptanceCases.some((item) => item.category === "Selection" && item.prompt?.includes("胃癌")), true);
  assert.equal(webMcpInspectorAcceptanceCases.some((item) => item.category === "Authority" && item.expectedToolNames.length === 0), true);
  assert.equal(webMcpInspectorAcceptanceCases.some((item) => item.category === "State"), true);
  assert.equal(webMcpInspectorAcceptanceCases.some((item) => item.category === "Lifecycle"), true);
});

test("manual Inspector receipt is bounded, self-attested, and stores no prompt content", () => {
  const outcomes = Object.fromEntries(webMcpInspectorAcceptanceCases.map((item) => [item.id, "pass"])) as Record<(typeof webMcpInspectorAcceptanceCases)[number]["id"], "pass">;
  const receipt = createWebMcpInspectorAcceptanceReceipt({
    generatedAt: "2026-09-02T12:00:00.000Z",
    origin: "https://trialbridge.example/private/path?note=never-store-this",
    chromeMajor: 152,
    outcomes,
  });
  assert.equal(receipt.artifactClass, "manual_inspector_self_attestation");
  assert.equal(receipt.origin, "https://trialbridge.example");
  assert.equal(receipt.chromeMajor, 152);
  assert.equal(receipt.selfAttested, true);
  assert.equal(receipt.cryptographicallyVerified, false);
  assert.equal(receipt.containsHealthInformation, false);
  assert.equal(receipt.storesPromptContent, false);
  assert.equal(receipt.status, "complete_pass");
  assert.deepEqual(receipt.summary, { total: 6, completed: 6, passed: 6, needsAttention: 0, notRun: 0 });
  assert.doesNotMatch(JSON.stringify(receipt), /胃癌|Enroll me|never-store-this|"prompt"\s*:|toolOutput|toolArgument/i);
});

test("partial and finding receipts cannot be mistaken for a passing browser verification", () => {
  const partial = createWebMcpInspectorAcceptanceReceipt({
    generatedAt: "2026-09-02T12:00:00.000Z",
    origin: "http://localhost:3001",
    outcomes: { "inspector-public-discovery": "pass" },
  });
  assert.equal(partial.status, "partial");
  assert.equal(partial.summary.notRun, 5);

  const findings = createWebMcpInspectorAcceptanceReceipt({
    generatedAt: "2026-09-02T12:00:00.000Z",
    origin: "http://localhost:3001",
    outcomes: Object.fromEntries(webMcpInspectorAcceptanceCases.map((item, index) => [item.id, index === 0 ? "needs_attention" : "pass"])) as Record<(typeof webMcpInspectorAcceptanceCases)[number]["id"], "pass" | "needs_attention">,
  });
  assert.equal(findings.status, "complete_with_findings");
  assert.equal(findings.summary.needsAttention, 1);
  assert.match(findings.evidenceBoundary, /does not by itself prove/i);
});
