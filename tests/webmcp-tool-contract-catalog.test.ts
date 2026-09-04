/// <reference types="webmcp-types" />
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type { TrialMatch } from "../lib/matching/engine.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";
import { buildTrialBridgeTools } from "../lib/webmcp/tools.ts";
import { webMcpToolContractBundle, webMcpToolContractCatalog } from "../lib/webmcp/toolContractCatalog.ts";
import { organizeSummaryFormContractCore, publicTrialFormContractCore, webMcpImperativeContractCore, webMcpZhHantToolTitles } from "../lib/webmcp/toolContractCore.ts";

const intakeToolName = "organize_deidentified_summary";
const agentIntake = { submit: async () => ({ state: "unavailable" as const, reason: "catalog test" }) };

const draft = profileDraftSchema.parse({ schemaVersion: "1.0", language: "en", subjectRole: "patient", facts: [{ id: "fact_contract_test", domain: "cancer_type", value: "synthetic cancer", displayZhHant: "虛構癌症", displayEn: "Synthetic cancer", source: "user_statement", confidence: 1, confirmed: false }], missingQuestions: [], safetyNote: "Synthetic contract fixture." });
const profile = confirmProfile(draft, {}, "patient", "2026-09-02T00:00:00.000Z");

test("canonical catalog covers the visible declarative form and every imperative tool", () => {
  const syntheticMatches = [{ trial: { canonicalId: "synthetic:contract-1" } }, { trial: { canonicalId: "synthetic:contract-2" } }] as TrialMatch[];
  const shortlistTools = buildTrialBridgeTools({ profile, matches: syntheticMatches, sensitiveConsent: true, shortlistedTrialIds: syntheticMatches.map((match) => match.trial.canonicalId) });
  const intakeTools = buildTrialBridgeTools({ matches: [], sensitiveConsent: false, agentIntake });
  assert.equal(shortlistTools.length, 7);
  assert.equal(intakeTools.length, 3);
  // The intake tool exists only before a profile; the union covers every contract.
  const actualTools = [...shortlistTools, ...intakeTools.filter((tool) => tool.name === intakeToolName)];
  assert.deepEqual(actualTools.map((tool) => tool.name).sort(), Object.keys(webMcpImperativeContractCore).sort());
  assert.deepEqual(webMcpToolContractCatalog.map((contract) => contract.name), [
    publicTrialFormContractCore.name, "trialbridge_method", "search_public_cancer_trials",
    organizeSummaryFormContractCore.name, intakeToolName,
    "review_trial_followups", "explain_confirmed_matches", "draft_trial_outreach", "draft_trial_discussion_brief", "compare_shortlisted_trials",
  ]);
  for (const tool of actualTools) {
    const contract = webMcpToolContractCatalog.find((item) => item.name === tool.name);
    assert.ok(contract);
    assert.equal(contract.kind, "Imperative");
    assert.equal(contract.title, tool.title);
    assert.equal(contract.description, tool.description);
    assert.deepEqual(contract.inputSchema, tool.inputSchema);
    assert.deepEqual(contract.annotations, tool.annotations);
  }
});

test("human-facing WebMCP titles follow the page language without changing machine contracts", () => {
  const syntheticMatches = [{ trial: { canonicalId: "synthetic:localized-1" } }, { trial: { canonicalId: "synthetic:localized-2" } }] as TrialMatch[];
  const localizedContext = { profile, matches: syntheticMatches, sensitiveConsent: true, shortlistedTrialIds: syntheticMatches.map((match) => match.trial.canonicalId) };
  const english = buildTrialBridgeTools({ ...localizedContext, language: "en" });
  const traditionalChinese = buildTrialBridgeTools({ ...localizedContext, language: "zh-Hant" });

  assert.equal(english.length, 7);
  assert.deepEqual(traditionalChinese.map((tool) => tool.name), english.map((tool) => tool.name));
  for (let index = 0; index < english.length; index += 1) {
    const englishTool = english[index]!;
    const traditionalChineseTool = traditionalChinese[index]!;
    assert.equal(traditionalChineseTool.title, webMcpZhHantToolTitles[traditionalChineseTool.name as keyof typeof webMcpZhHantToolTitles]);
    assert.notEqual(traditionalChineseTool.title, englishTool.title);
    assert.equal(traditionalChineseTool.description, englishTool.description);
    assert.deepEqual(traditionalChineseTool.inputSchema, englishTool.inputSchema);
    assert.deepEqual(traditionalChineseTool.annotations, englishTool.annotations);
  }
});

test("all tool contracts meet Chrome character and authority boundaries", () => {
  assert.equal(webMcpToolContractCatalog.length, 10);
  assert.equal(new Set(webMcpToolContractCatalog.map((contract) => contract.name)).size, 10);
  const intakeContracts = new Set([organizeSummaryFormContractCore.name, intakeToolName]);
  assert.equal(webMcpToolContractCatalog.every((contract) => contract.readOnlyBehavior === !intakeContracts.has(contract.name)), true, "only the switch-gated intake surfaces change page state");
  assert.equal(webMcpToolContractCatalog.filter((contract) => intakeContracts.has(contract.name)).every((contract) => contract.availabilityGroup === "intake" && typeof contract.stateEffect === "string"), true);
  assert.equal(webMcpToolContractCatalog.every((contract) => contract.budgets.withinGuidance), true);
  assert.equal(webMcpToolContractCatalog.every((contract) => contract.name.length <= 30 && contract.description.length <= 500), true);
  assert.equal(webMcpToolContractCatalog.every((contract) => contract.parameters.every((parameter) => parameter.name.length <= 30 && parameter.description.length <= 150)), true);
  assert.equal(webMcpToolContractCatalog.every((contract) => contract.inputSchema.additionalProperties === false), true);
  assert.equal(webMcpToolContractCatalog.filter((contract) => contract.kind === "Imperative").every((contract) => contract.browserHints?.readOnlyHint === (contract.name !== intakeToolName)), true);
  assert.equal(webMcpToolContractCatalog.filter((contract) => contract.name !== "trialbridge_method" && !intakeContracts.has(contract.name)).every((contract) => contract.untrustedOutput), true);
  assert.equal(webMcpToolContractCatalog.some((contract) => /send|enroll|book|consent|treatment_change/.test(contract.name)), false);
});

test("downloadable contract bundle is static, metadata-only, and not a protocol claim", async () => {
  assert.equal(webMcpToolContractBundle.artifactClass, "tool_contract_catalog_not_protocol_metadata");
  assert.deepEqual(webMcpToolContractBundle.summary, { tools: 10, declarative: 2, imperative: 8, readOnlyBehavior: 8, stateChanging: 2, writeAuthority: 0, untrustedOutput: 7, withinChromeGuidance: 10 });
  assert.equal(webMcpToolContractBundle.privacyBoundary.containsHealthInformation, false);
  assert.equal(webMcpToolContractBundle.privacyBoundary.readsCurrentBrowserSession, false);
  assert.equal(webMcpToolContractBundle.privacyBoundary.readsMedicalWorkflowState, false);
  assert.match(webMcpToolContractBundle.evidenceBoundary, /not a WebMCP protocol endpoint/i);
  assert.doesNotMatch(JSON.stringify(webMcpToolContractBundle), /"(?:rawText|maskedText|confirmedProfile|trialResult|toolArgument|toolOutput|promptContent)"\s*:/i);

  const route = await readFile(path.join(process.cwd(), "app", "webmcp", "contracts.json", "route.ts"), "utf8");
  assert.match(route, /dynamic = "force-static"/);
  assert.match(route, /webMcpToolContractBundle/);
  assert.match(route, /Cache-Control/);
});
