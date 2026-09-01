/// <reference types="webmcp-types" />

import { readFileSync } from "node:fs";
import { buildTrialBridgeTools } from "../lib/webmcp/tools.ts";
import { capWebMcpOutput, maxWebMcpOutputChars } from "../lib/webmcp/output.ts";
import { confirmProfile, profileDraftSchema } from "../lib/profile/schema.ts";

const findings: string[] = [];
const draft = profileDraftSchema.parse({
  schemaVersion: "1.0",
  language: "en",
  subjectRole: "patient",
  facts: [{
    id: "fact_conformance_cancer",
    domain: "cancer_type",
    value: "synthetic gastric cancer",
    displayZhHant: "虛構胃癌",
    displayEn: "Synthetic gastric cancer",
    source: "user_statement",
    confidence: 1,
    confirmed: false,
  }],
  missingQuestions: [],
  safetyNote: "Synthetic conformance fixture only.",
});
const profile = confirmProfile(draft, {}, "patient", "2026-09-01T00:00:00.000Z");
const publicTools = buildTrialBridgeTools({ matches: [], sensitiveConsent: false });
const allTools = buildTrialBridgeTools({ profile, matches: [], sensitiveConsent: true });
const names = allTools.map((tool) => tool.name);

function check(condition: boolean, message: string) {
  if (!condition) findings.push(message);
}

check(new Set(names).size === names.length, "Imperative tool names must be unique.");
check(publicTools.length === 2, "Exactly two public imperative tools must remain available without confirmed context.");
check(allTools.length === 4, "Exactly four imperative tools must be available after confirmed-context permission.");

for (const tool of allTools) {
  check(/^[A-Za-z0-9_.-]+$/.test(tool.name), `${tool.name}: name contains unsupported characters.`);
  check(tool.name.length <= 30, `${tool.name}: name exceeds 30 characters.`);
  check(tool.description.length <= 500, `${tool.name}: description exceeds 500 characters.`);
  check(tool.annotations?.readOnlyHint === true, `${tool.name}: readOnlyHint must be true.`);
  check(!/^(?:send|submit|enroll|book|consent|treat)/i.test(tool.name), `${tool.name}: forbidden side-effect authority.`);
  const schema = tool.inputSchema as { type?: string; properties?: Record<string, { description?: string }>; additionalProperties?: boolean };
  check(schema.type === "object", `${tool.name}: input schema must be an object.`);
  check(schema.additionalProperties === false, `${tool.name}: additionalProperties must be false.`);
  for (const [parameterName, parameter] of Object.entries(schema.properties ?? {})) {
    check(parameterName.length <= 30, `${tool.name}.${parameterName}: parameter name exceeds 30 characters.`);
    check(Boolean(parameter.description), `${tool.name}.${parameterName}: parameter description is required.`);
    check((parameter.description?.length ?? 0) <= 150, `${tool.name}.${parameterName}: parameter description exceeds 150 characters.`);
  }
}

for (const toolName of ["search_public_cancer_trials", "explain_confirmed_matches", "draft_trial_outreach"]) {
  check(allTools.find((tool) => tool.name === toolName)?.annotations?.untrustedContentHint === true, `${toolName}: registry-derived content must be marked untrusted.`);
}

const metadata = JSON.stringify(allTools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))).toLocaleLowerCase("en");
check(!metadata.includes("rawnote") && !metadata.includes("maskednote"), "Raw or masked note fields must never enter an imperative tool contract.");
check(JSON.stringify(capWebMcpOutput("x".repeat(maxWebMcpOutputChars * 2))).length <= maxWebMcpOutputChars + 32, "Tool-output cap is not effective.");

const declarative = readFileSync("app/components/TrialDatabase.tsx", "utf8");
for (const marker of ["const declarativeToolName = \"search_public_trial_form\"", "toolname={declarativeToolName}", "tooldescription=", "toolautosubmit=", "toolparamdescription=", "agentInvoked", "respondWith(searchPromise)"]) {
  check(declarative.includes(marker), `Declarative search form is missing ${marker}.`);
}
check((declarative.match(/toolname=/g) ?? []).length === 1, "The public database must expose one visible declarative form tool.");

const bridge = readFileSync("app/components/WebMcpBridge.tsx", "utf8");
for (const marker of ["document.modelContext", "registerTool", "getTools", "controller.abort()", "exposedTo: [location.origin]"]) {
  check(bridge.includes(marker), `Imperative bridge is missing ${marker}.`);
}

const headers = readFileSync("next.config.ts", "utf8");
check(headers.includes("tools=(self)"), "Permissions-Policy must restrict WebMCP tools to this origin.");
check(headers.includes("Cross-Origin-Opener-Policy"), "Cross-Origin-Opener-Policy header is required.");

const productSources = [declarative, bridge, readFileSync("lib/webmcp/tools.ts", "utf8")].join("\n");
check(!productSources.includes("navigator.modelContext"), "Deprecated navigator.modelContext must not be used.");

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    imperativeTools: allTools.length,
    publicImperativeTools: publicTools.length,
    declarativeTools: 1,
    names,
    outputLimitCharacters: maxWebMcpOutputChars,
    findings: 0,
  }));
}
