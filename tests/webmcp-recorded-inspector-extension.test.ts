import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { webMcpInspectorAcceptanceCases } from "../lib/webmcp/inspectorAcceptance.ts";

test("recorded stock Inspector evidence is three-of-six, metadata-only, and provider-policy bounded", async () => {
  const source = await readFile(new URL("../evals/webmcp-inspector-extension-runtime.json", import.meta.url), "utf8");
  const artifact = JSON.parse(source) as {
    artifactClass: string;
    inspector: { repository: string; commit: string; version: string; stockSourceModified: boolean };
    browser: { product: string; channel: string; version: string; headless: boolean; localTestingFeatures: string[] };
    target: { origin: string; route: string; permissionTransitionRoute: string; secureContext: boolean };
    result: {
      status: string;
      checksPassed: number;
      checksTotal: number;
      checks: Array<{ id: string; status: string; evidence?: string; reason?: string }>;
      publicToolNames: string[];
      schemasParsed: number;
      schemasExpected: number;
      observedAnnotations: Record<string, Record<string, boolean>>;
      safeExecution: { toolName: string; inputPropertyCount: number; completed: boolean; boundedReadOnlyResponse: boolean; changedWorkflowState: boolean; returnedContractKeys: string[] };
      permissionTransition: { sequence: Array<{ phase: string; toolCount: number }>; addedToolNames: string[]; removedToolNames: string[]; apiKeyConfigured: boolean; containsHealthInformation: boolean };
    };
    providerBoundary: { apiKeyConfigured: boolean; naturalLanguagePathInvoked: boolean; requiredCredential: string; projectAllowedCloudModel: string; manualPathPolicyCompatible: boolean };
    sourceCapabilityAudit: { commit: string; manualExecutePassesAbortSignal: boolean; naturalLanguageExecutePassesAbortSignal: boolean; agentCancelControlAvailable: boolean; resetCancelsExecution: boolean; toolCancelEventIsObservationOnly: boolean; sourceLinks: string[] };
    privacyBoundary: Record<string, boolean | string>;
    evidenceBoundary: string;
  };

  assert.equal(artifact.artifactClass, "recorded_stock_inspector_extension_runtime_partial");
  assert.deepEqual(
    { repository: artifact.inspector.repository, commit: artifact.inspector.commit, version: artifact.inspector.version, stockSourceModified: artifact.inspector.stockSourceModified },
    { repository: "https://github.com/beaufortfrancois/model-context-tool-inspector", commit: "f164a9aa5c3f6083f5976ccae308257bdf86cb99", version: "1.9.14", stockSourceModified: false },
  );
  assert.deepEqual(
    { product: artifact.browser.product, channel: artifact.browser.channel, version: artifact.browser.version, headless: artifact.browser.headless },
    { product: "Chrome for Testing", channel: "Beta", version: "153.0.8010.12", headless: true },
  );
  assert.deepEqual(artifact.browser.localTestingFeatures, ["WebMCP", "WebMCPTesting"]);
  assert.deepEqual(artifact.target, { origin: "http://localhost:3001", route: "/webmcp", permissionTransitionRoute: "/match?demo=synthetic#private-chat", secureContext: true });
  assert.equal(artifact.result.status, "partial");
  assert.equal(artifact.result.checksPassed, 3);
  assert.equal(artifact.result.checksTotal, webMcpInspectorAcceptanceCases.length);
  assert.deepEqual(artifact.result.checks.map((item) => item.id), webMcpInspectorAcceptanceCases.map((item) => item.id));
  assert.deepEqual(artifact.result.checks.map((item) => item.status), ["pass", "pass", "not_run", "not_run", "pass", "not_run"]);
  assert.equal(artifact.result.checks.every((item) => item.status === "pass" ? Boolean(item.evidence) : Boolean(item.reason)), true);
  assert.deepEqual(artifact.result.publicToolNames, ["search_public_cancer_trials", "trialbridge_method"]);
  assert.equal(artifact.result.schemasParsed, 2);
  assert.equal(artifact.result.schemasExpected, 2);
  assert.deepEqual(artifact.result.observedAnnotations.search_public_cancer_trials, { readOnlyHint: true, untrustedContentHint: true });
  assert.deepEqual(artifact.result.observedAnnotations.trialbridge_method, { readOnlyHint: true });
  assert.deepEqual(artifact.result.safeExecution, {
    toolName: "trialbridge_method",
    inputPropertyCount: 0,
    completed: true,
    boundedReadOnlyResponse: true,
    changedWorkflowState: false,
    returnedContractKeys: ["searchOrder", "sources", "privacy", "limitation"],
  });
  assert.deepEqual(artifact.result.permissionTransition.sequence.map((item) => item.toolCount), [2, 2, 6, 2]);
  assert.deepEqual(artifact.result.permissionTransition.addedToolNames, artifact.result.permissionTransition.removedToolNames);
  assert.equal(artifact.result.permissionTransition.addedToolNames.length, 4);
  assert.equal(artifact.result.permissionTransition.apiKeyConfigured, false);
  assert.equal(artifact.result.permissionTransition.containsHealthInformation, false);
  assert.deepEqual(
    { apiKeyConfigured: artifact.providerBoundary.apiKeyConfigured, naturalLanguagePathInvoked: artifact.providerBoundary.naturalLanguagePathInvoked, requiredCredential: artifact.providerBoundary.requiredCredential, projectAllowedCloudModel: artifact.providerBoundary.projectAllowedCloudModel, manualPathPolicyCompatible: artifact.providerBoundary.manualPathPolicyCompatible },
    { apiKeyConfigured: false, naturalLanguagePathInvoked: false, requiredCredential: "Gemini API key", projectAllowedCloudModel: "gpt-oss:120b-cloud", manualPathPolicyCompatible: true },
  );
  assert.deepEqual(
    {
      commit: artifact.sourceCapabilityAudit.commit,
      manualExecutePassesAbortSignal: artifact.sourceCapabilityAudit.manualExecutePassesAbortSignal,
      naturalLanguageExecutePassesAbortSignal: artifact.sourceCapabilityAudit.naturalLanguageExecutePassesAbortSignal,
      agentCancelControlAvailable: artifact.sourceCapabilityAudit.agentCancelControlAvailable,
      resetCancelsExecution: artifact.sourceCapabilityAudit.resetCancelsExecution,
      toolCancelEventIsObservationOnly: artifact.sourceCapabilityAudit.toolCancelEventIsObservationOnly,
    },
    {
      commit: artifact.inspector.commit,
      manualExecutePassesAbortSignal: false,
      naturalLanguageExecutePassesAbortSignal: false,
      agentCancelControlAvailable: false,
      resetCancelsExecution: false,
      toolCancelEventIsObservationOnly: true,
    },
  );
  assert.equal(artifact.sourceCapabilityAudit.sourceLinks.length, 2);
  assert.equal(artifact.privacyBoundary.containsHealthInformation, false);
  assert.equal(artifact.privacyBoundary.storesInvocationInputs, false);
  assert.equal(artifact.privacyBoundary.storesExecutionResults, false);
  assert.equal(artifact.privacyBoundary.storesToolDescriptions, false);
  assert.equal(artifact.privacyBoundary.storesRawSchemas, false);
  assert.match(artifact.evidenceBoundary, /partial artifact does not prove/i);
  assert.doesNotMatch(source, /"(?:rawText|maskedText|medicalNote|confirmedProfile|profileFact|trialResult|prompt|toolArgument|toolOutput|description|inputSchema|outputSchema|content|thinking)"\s*:/i);
});
