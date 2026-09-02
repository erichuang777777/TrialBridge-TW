import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { cancerCoverage } from "../evals/cancer-coverage.ts";

test("all-cancer search coverage is explicit without unearned validation claims", () => {
  assert.equal(cancerCoverage.length >= 19, true);
  assert.equal(cancerCoverage.every((group) => group.searchable), true);
  assert.equal(cancerCoverage.every((group) => group.maturity === "unreviewed"), true);
  assert.equal(new Set(cancerCoverage.map((group) => group.cancerGroup)).size, cancerCoverage.length);
});

test("accessibility foundation includes skip link, focus, touch size, and reduced motion", async () => {
  const root = process.cwd();
  const layout = await readFile(path.join(root, "app", "layout.tsx"), "utf8");
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
  const instrumentation = await readFile(path.join(root, "instrumentation-client.ts"), "utf8");
  assert.match(layout, /skip-link/);
  assert.match(layout, /lang="en"/);
  assert.match(css, /focus-visible/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(instrumentation, /bis_skin_checked\|bis_register\|__processed_/);
  assert.doesNotMatch(layout, /suppressHydrationWarning/);
});

test("no browser persistence API is used in product code", async () => {
  const files = ["app/components/TrialBridgeChat.tsx", "app/components/WebMcpBridge.tsx", "app/webmcp/_components/WebMcpDiagnostics.tsx", "lib/chat/state.ts", "lib/privacy/mask.ts", "lib/webmcp/receipt.ts", "lib/webmcp/runtimeAcceptance.ts"];
  for (const file of files) {
    const content = await readFile(path.join(process.cwd(), file), "utf8");
    assert.doesNotMatch(content, /localStorage|sessionStorage|indexedDB/i, file);
  }
});

test("all LLM surfaces require gpt-oss cloud and expose no local inference path", async () => {
  const root = process.cwd();
  const files = [
    ".env.example",
    "app/components/TrialBridgeChat.tsx",
    "lib/llm/cloud.ts",
    "lib/llm/extraction.ts",
  ];
  const combined = (await Promise.all(files.map((file) => readFile(path.join(root, file), "utf8")))).join("\n");
  assert.match(combined, /gpt-oss:120b-cloud/);
  assert.doesNotMatch(combined, /medgemma|modelPreference|\/api\/local-model/i);
});

test("privacy copy uses the visible cloud action without reintroducing a redundant checkbox", async () => {
  const privacy = await readFile(path.join(process.cwd(), "app", "privacy", "page.tsx"), "utf8");
  assert.match(privacy, /visible cloud-organization action/);
  assert.match(privacy, /there is no redundant consent checkbox/);
  assert.doesNotMatch(privacy, /explicit checkbox consent/);
});

test("cloud extraction exposes a compact success and failure receipt without storing content", async () => {
  const [chat, confirmation, route, receipt] = await Promise.all([
    readFile(path.join(process.cwd(), "app/components/TrialBridgeChat.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "app/components/SummaryConfirmation.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "app/api/cloud/extract/route.ts"), "utf8"),
    readFile(path.join(process.cwd(), "lib/llm/extractionReceipt.ts"), "utf8"),
  ]);
  assert.match(chat, /extraction-failure-receipt/);
  assert.match(confirmation, /Cloud extraction receipt/);
  assert.match(confirmation, /Provider retention is not assessed/);
  assert.match(route, /createCloudExtractionReceipt/);
  assert.match(receipt, /trialBridgePersisted: false/);
  assert.match(receipt, /containsMedicalContent: false/);
  assert.match(receipt, /containsModelContent: false/);
  assert.doesNotMatch(receipt, /maskedText|rawText|facts|promptContent|modelContent/);
});

test("the public trial database is directly linked from the English-first home page", async () => {
  const root = process.cwd();
  const home = await readFile(path.join(root, "app", "page.tsx"), "utf8");
  const database = await readFile(path.join(root, "app", "trials", "page.tsx"), "utf8");
  assert.match(home, /href="\/trials"/);
  assert.match(database, /Search trial registries directly/);
});

test("the visible public database form is also a declarative WebMCP tool", async () => {
  const root = process.cwd();
  const database = await readFile(path.join(root, "app", "components", "TrialDatabase.tsx"), "utf8");
  const contracts = await readFile(path.join(root, "lib", "webmcp", "toolContractCore.ts"), "utf8");
  assert.match(database, /const declarativeToolName = publicTrialFormContractCore\.name/);
  assert.match(contracts, /name: "search_public_trial_form"/);
  assert.match(database, /publicTrialFormContractCore\.description/);
  assert.match(database, /toolname=\{declarativeToolName\}/);
  assert.match(database, /tooldescription=/);
  assert.match(database, /toolautosubmit=/);
  assert.match(database, /toolparamdescription=/);
  assert.match(database, /agentInvoked/);
  assert.match(database, /respondWith\(searchPromise\)/);
});

test("the public database exposes a deterministic bilingual registry query bridge", async () => {
  const root = process.cwd();
  const database = await readFile(path.join(root, "app", "components", "TrialDatabase.tsx"), "utf8");
  const route = await readFile(path.join(root, "app", "api", "trials", "search", "route.ts"), "utf8");
  const bridge = await readFile(path.join(root, "lib", "trials", "queryBridge.ts"), "utf8");
  assert.match(database, /Bilingual registry query bridge/);
  assert.match(database, /跨語言試驗搜尋橋/);
  assert.match(database, /queryPlan\.registryConditions\.TFDA/);
  assert.match(database, /queryPlan\.registryConditions\["ClinicalTrials\.gov"\]/);
  assert.match(database, /fresh cache · snapshot/);
  assert.match(database, /stale cache · snapshot/);
  assert.match(database, /refresh requested/);
  assert.match(database, /Each registry stops after/);
  assert.match(database, /searchElapsedSeconds/);
  assert.match(database, /Partial registry results/);
  assert.match(database, /formatRegistryDuration/);
  assert.match(database, /SOURCE_TIMEOUT/);
  assert.match(database, /role="status" aria-atomic="true"/);
  assert.doesNotMatch(database, /database-results" aria-live/);
  assert.match(route, /createRegistryQueryPlan/);
  assert.match(route, /queryPlan\.registryConditions/);
  assert.match(bridge, /curated_bilingual_cancer_lexicon/);
  assert.match(bridge, /pass_through/);
  assert.doesNotMatch(bridge, /fetch\(|gpt-oss|ollama|cloud/i);
});

test("the competition proof page exposes live WebMCP evidence without overstating Inspector validation", async () => {
  const root = process.cwd();
  const page = await readFile(path.join(root, "app", "webmcp", "page.tsx"), "utf8");
  const inventory = await readFile(path.join(root, "lib", "webmcp", "capabilityInventory.ts"), "utf8");
  const contractCatalog = await readFile(path.join(root, "lib", "webmcp", "toolContractCatalog.ts"), "utf8");
  const judgeBundle = await readFile(path.join(root, "lib", "webmcp", "judgeBundle.ts"), "utf8");
  const recordedBrowserRuntime = await readFile(path.join(root, "evals", "webmcp-browser-runtime-acceptance.json"), "utf8");
  const evidenceRoute = await readFile(path.join(root, "app", "webmcp", "evidence.json", "route.ts"), "utf8");
  const contractRoute = await readFile(path.join(root, "app", "webmcp", "contracts.json", "route.ts"), "utf8");
  const contractExplorer = await readFile(path.join(root, "app", "webmcp", "_components", "ToolContractExplorer.tsx"), "utf8");
  const capabilitySimulator = await readFile(path.join(root, "app", "webmcp", "_components", "CapabilityStateSimulator.tsx"), "utf8");
  const diagnostic = await readFile(path.join(root, "app", "webmcp", "_components", "WebMcpDiagnostics.tsx"), "utf8");
  const runtimeAcceptance = await readFile(path.join(root, "lib", "webmcp", "runtimeAcceptance.ts"), "utf8");
  const database = await readFile(path.join(root, "app", "components", "TrialDatabase.tsx"), "utf8");
  const searchUrl = await readFile(path.join(root, "lib", "trials", "searchUrl.ts"), "utf8");
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
  const home = await readFile(path.join(root, "app", "page.tsx"), "utf8");
  assert.match(home, /href="\/webmcp"/);
  assert.match(page, /WebMCP, visible and testable/);
  assert.match(page, /Model Context Tool Inspector/);
  assert.match(inventory, /webMcpToolContractCatalog/);
  assert.match(page, /ToolContractExplorer/);
  assert.match(contractExplorer, /Canonical tool contracts/);
  assert.match(contractExplorer, /Copy JSON Schema/);
  assert.match(contractExplorer, /Download contracts JSON/);
  assert.match(contractExplorer, /role="status" aria-atomic="true"/);
  assert.match(contractRoute, /dynamic = "force-static"/);
  assert.match(page, /CapabilityStateSimulator/);
  assert.match(capabilitySimulator, /State-scoped capability simulator/);
  assert.match(capabilitySimulator, /role="group" aria-label="Choose a synthetic capability state"/);
  assert.match(capabilitySimulator, /role="status" aria-atomic="true"/);
  assert.match(capabilitySimulator, /No tool is executed and no health information is created, read, or stored/);
  assert.match(page, /baselineJourneyCount/);
  assert.match(page, /Recorded cloud-model baseline/);
  assert.match(page, /selectionBaseline\.summary\.passed/);
  assert.match(page, /What remains separate/);
  assert.match(page, /Chrome Inspector and clinical validation/);
  assert.match(page, /webmcp-selection-baseline\.json/);
  assert.match(contractCatalog, /review_trial_followups/);
  assert.match(contractCatalog, /draft_trial_discussion_brief/);
  assert.match(contractCatalog, /compare_shortlisted_trials/);
  assert.match(page, /19<\/strong> bilingual cancer groups/);
  assert.match(page, /Capability changes leave a payload-free session receipt/);
  assert.match(page, /latest 20 lifecycle events/);
  assert.match(page, /Standards alignment/);
  assert.match(page, /One product surface, both WebMCP API styles/);
  assert.match(page, /Compatibility profile audited/);
  assert.match(page, /toolchange · register signal · execute signal/);
  assert.match(page, /Run six no-PHI lifecycle checks/);
  assert.match(page, /Recorded Chrome evidence/);
  assert.match(page, /recordedBrowserRuntime\.checksPassed/);
  assert.match(page, /Two public tools remained after cleanup/);
  assert.match(page, /Inspect receipt/);
  assert.match(page, /Origin Trial deployment/);
  assert.match(page, /Local testing profile · no production token/);
  assert.match(page, /Chrome DevTools validation and Inspector acceptance are still required/);
  assert.match(page, /Token in JSON/);
  assert.match(page, /product execution cancellation also reaches browser fetch, Next request, and each registry adapter/);
  assert.match(page, /webmachinelearning\.github\.io\/webmcp/);
  assert.match(page, /Four-step judge path/);
  assert.match(page, /About 5 minutes/);
  assert.match(page, /\/trials\?condition=%E8%83%83%E7%99%8C/);
  assert.match(page, /\/\?demo=synthetic#private-chat/);
  assert.match(page, /steps 1–3 are built into TrialBridge TW/);
  assert.match(page, /Critical user journey/);
  assert.match(page, /webMcpCriticalJourney\.steps/);
  assert.match(page, /Chrome&apos;s user-journey guidance/);
  assert.match(page, /Judge conformance bundle/);
  assert.match(page, /Every WebMCP claim carries an evidence class/);
  assert.match(page, /Download evidence JSON/);
  assert.match(page, /reads no browser session, note, profile, results, or chat/);
  assert.match(judgeBundle, /competition_evidence_not_protocol_metadata/);
  assert.match(judgeBundle, /repository_verified/);
  assert.match(judgeBundle, /recorded_model_eval/);
  assert.match(recordedBrowserRuntime, /recorded_live_browser_runtime_acceptance/);
  assert.match(judgeBundle, /recordedBrowserRuntime/);
  assert.match(judgeBundle, /manual_gate/);
  assert.match(judgeBundle, /do not replace Chrome Model Context Tool Inspector/);
  assert.match(evidenceRoute, /dynamic = "force-static"/);
  assert.match(evidenceRoute, /Response\.json\(webMcpJudgeBundle/);
  assert.match(evidenceRoute, /Content-Disposition/);
  assert.match(diagnostic, /createWebMcpDiagnosticReceipt/);
  assert.match(diagnostic, /Download this browser&apos;s diagnostic receipt/);
  assert.match(diagnostic, /Browser diagnostic receipt downloaded to this device/);
  assert.match(database, /parsePublicTrialSearchParams/);
  assert.match(database, /history\.replaceState/);
  assert.match(database, /not a curated general cancer condition/);
  assert.match(database, /without storing it in the URL/);
  assert.match(database, /addEventListener\("toolcanceled"/);
  assert.match(database, /addEventListener\("toolcancel"/);
  assert.match(searchUrl, /hasDirectIdentifiers/);
  assert.match(searchUrl, /curated_bilingual_cancer_lexicon/);
  assert.match(css, /\.judge-runbook ol/);
  assert.match(css, /\.standards-grid/);
  assert.match(css, /\.recorded-runtime-proof/);
  assert.match(css, /\.origin-trial-readiness/);
  assert.match(css, /\.conformance-matrix > article \{ display: grid/);
  assert.match(css, /\.conformance-state > span/);
  assert.match(css, /conformance-matrix > article > div:nth-child\(2\).*text-align: left/);
  assert.match(css, /\.conformance-matrix > article \{ grid-template-columns: 1fr/);
  assert.match(diagnostic, /document\.modelContext/);
  assert.match(diagnostic, /getTools/);
  assert.match(diagnostic, /runWebMcpRuntimeAcceptance/);
  assert.match(diagnostic, /One-click WebMCP lifecycle acceptance/);
  assert.match(diagnostic, /role="status" aria-atomic="true"/);
  assert.match(diagnostic, /trialbridge_runtime_probe/);
  assert.match(runtimeAcceptance, /registerTool/);
  assert.match(runtimeAcceptance, /getTools/);
  assert.match(runtimeAcceptance, /executeTool/);
  assert.match(runtimeAcceptance, /executeSafeMethodToolCompat/);
  assert.match(runtimeAcceptance, /addEventListener\("toolchange"/);
  assert.match(runtimeAcceptance, /registrationController\.abort\(\)/);
  assert.match(runtimeAcceptance, /containsHealthInformation: false/);
  assert.match(runtimeAcceptance, /storesToolPayloads: false/);
  assert.match(diagnostic, /tools=\(self\)/);
  assert.match(diagnostic, /aria-atomic="true"/);
  assert.doesNotMatch(diagnostic, /rawText|maskedText|ConfirmedProfile/);
});

test("trial cards expose five useful comparison blocks, hover details, and patient facts without relying on color alone", async () => {
  const root = process.cwd();
  const component = await readFile(path.join(root, "app", "components", "TrialMatchCard.tsx"), "utf8");
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
  for (const criterion of ["condition", "recruitment", "age", "sex", "location"]) {
    assert.match(component, new RegExp(`\\b${criterion}\\b`));
  }
  for (const state of ["possibly_met", "possibly_not_met", "unknown", "missing"]) {
    assert.match(component, new RegExp(`\\b${state}\\b`));
    assert.match(css, new RegExp(`assessment-${state}`));
  }
  assert.match(component, /Aligned/);
  assert.match(component, /Different/);
  assert.match(component, /Uncertain/);
  assert.match(component, /Missing/);
  assert.match(component, /patientFactGroups/);
  assert.match(component, /Subtype/);
  assert.match(component, /Stage/);
  assert.match(component, /criterion-tooltip/);
  assert.doesNotMatch(component, /en: "Other"/);
});

test("development shortcuts are explicitly gated and use only a synthetic fixture", async () => {
  const component = await readFile(path.join(process.cwd(), "app", "components", "TrialBridgeChat.tsx"), "utf8");
  assert.match(component, /process\.env\.NODE_ENV === "development"/);
  assert.match(component, /Synthetic data only/);
  assert.match(component, /syntheticDevDraft/);
});

test("review, clarification, grouped result views, and dedicated result chat remain visible product concepts", async () => {
  const root = process.cwd();
  const review = await readFile(path.join(root, "app", "components", "SummaryConfirmation.tsx"), "utf8");
  const clarification = await readFile(path.join(root, "app", "components", "ClarificationPanel.tsx"), "utf8");
  const chat = await readFile(path.join(root, "app", "components", "TrialBridgeChat.tsx"), "utf8");
  const webmcp = await readFile(path.join(root, "app", "components", "WebMcpBridge.tsx"), "utf8");
  const receipt = await readFile(path.join(root, "lib", "webmcp", "receipt.ts"), "utf8");
  const brief = await readFile(path.join(root, "app", "components", "DiscussionBriefPanel.tsx"), "utf8");
  const shortlist = await readFile(path.join(root, "app", "components", "TrialShortlistPanel.tsx"), "utf8");
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
  assert.match(review, /Masked note/);
  assert.match(review, /Confirm all/);
  assert.match(review, /fact-domain-label/);
  assert.match(review, /panel-step/);
  assert.match(review, /Treatment detail/);
  assert.match(review, /Clinical detail/);
  assert.match(clarification, /Before showing results/);
  assert.match(clarification, /I don't know/);
  assert.doesNotMatch(clarification, /I confirm these answers/);
  assert.doesNotMatch(chat, /You confirmed this summary/);
  assert.doesNotMatch(chat, /cloudExtractionConsent/);
  assert.match(chat, /persistent-chat-panel/);
  assert.match(chat, /TrialBridge assistant/);
  assert.match(chat, /Agent mode/);
  assert.match(chat, /Manual mode/);
  assert.match(chat, /Chat is the main interface/);
  assert.match(chat, /Try a synthetic case/);
  assert.match(chat, /START_SYNTHETIC_DEMO/);
  assert.match(chat, /initialSyntheticDemo/);
  assert.match(chat, /removeSyntheticDemoSearch/);
  assert.match(chat, /Privacy, masking, cloud organization, confirmation, and questions still run in order/);
  assert.match(chat, /No real patient data/);
  assert.match(chat, /\/api\/cloud\/intake/);
  assert.doesNotMatch(chat, /I am the patient/);
  assert.doesNotMatch(chat, /I am a caregiver/);
  assert.doesNotMatch(chat, /I(?:'|’|\s+a)?m\s+(?:the\s+)?patient|I\s+am\s+a\s+care\s*giver/i);
  assert.doesNotMatch(chat, /SELECT_ROLE|SET_SUBJECT_ROLE|select_patient|select_caregiver/);
  assert.match(chat, /No known public-record difference/);
  assert.match(chat, /More information needed/);
  assert.match(chat, /Public-record differences found/);
  assert.match(chat, /Ask about the results/);
  assert.match(chat, /Create discussion brief/);
  assert.match(chat, /DiscussionBriefPanel/);
  assert.match(chat, /TrialShortlistPanel/);
  assert.match(chat, /shortlistedTrialIds/);
  assert.match(chat, /aria-pressed/);
  assert.match(webmcp, /WebMCP Live/);
  assert.match(webmcp, /getTools/);
  assert.match(webmcp, /role="status"/);
  assert.match(webmcp, /Judge prompts/);
  assert.match(webmcp, /explain_confirmed_matches/);
  assert.match(webmcp, /review_trial_followups/);
  assert.match(webmcp, /webmcp-agent-activity/);
  assert.match(webmcp, /draft_trial_discussion_brief/);
  assert.match(webmcp, /compare_shortlisted_trials/);
  assert.match(webmcp, /Select 2 trials to activate/);
  assert.match(webmcp, /Session capability receipt/);
  assert.match(webmcp, /createWebMcpSessionReceipt/);
  assert.match(receipt, /No medical note, profile fact, trial result, prompt, tool argument, or tool output/);
  assert.match(receipt, /maxWebMcpReceiptEvents = 20/);
  assert.match(shortlist, /Human-controlled shortlist/);
  assert.match(shortlist, /Compare up to three trials/);
  assert.match(shortlist, /Public-record comparison only/);
  assert.match(shortlist, /<table>/);
  assert.match(shortlist, /shortlist-mobile-cards/);
  assert.match(brief, /new Blob/);
  assert.match(brief, /URL\.createObjectURL/);
  assert.match(brief, /link\.download/);
  assert.match(brief, /Contains confirmed health information/);
  assert.match(brief, /aria-atomic="true"/);
  assert.doesNotMatch(brief, /fetch\(|localStorage|sessionStorage/);
  assert.doesNotMatch(webmcp, /catch\(\(\) => undefined\)/);
  assert.match(css, /grid-template-rows:\s*subgrid/);
  assert.match(css, /persistent-chat-panel/);
  assert.match(css, /webmcp-live-panel/);
  assert.match(css, /criterion-tooltip/);
  assert.match(css, /patient-fact-strip/);
});

test("judge cloud smoke test is explicit, body-free, bounded, cancellable, and metadata-only", async () => {
  const root = process.cwd();
  const service = await readFile(path.join(root, "lib", "llm", "cloudProbe.ts"), "utf8");
  const route = await readFile(path.join(root, "app", "api", "cloud", "probe", "route.ts"), "utf8");
  const bodyGuard = await readFile(path.join(root, "lib", "security", "requestBody.ts"), "utf8");
  const surface = await readFile(path.join(root, "app", "webmcp", "_components", "WebMcpDiagnostics.tsx"), "utf8");
  const verifier = await readFile(path.join(root, "scripts", "verify-cloud.ts"), "utf8");
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");

  assert.match(service, /cloudProbeTimeoutMs = 30_000/);
  assert.match(service, /fixed synthetic availability probe/);
  assert.match(service, /containsHealthInformation: false/);
  assert.match(service, /storesModelContent: false/);
  assert.doesNotMatch(service, /rawText|maskedText|confirmedProfile|trialResult/);
  assert.match(route, /hasDeclaredRequestBody\(request\)/);
  assert.match(bodyGuard, /request\.headers\.get\("content-length"\)/);
  assert.match(bodyGuard, /request\.headers\.has\("transfer-encoding"\)/);
  assert.match(bodyGuard, /request\.headers\.has\("content-type"\)/);
  assert.match(route, /bucket: "cloud-probe", limit: 3, windowMs: 10 \* 60_000/);
  assert.equal(route.indexOf("if (hasDeclaredRequestBody(request))") < route.indexOf("const limit = consumeRateLimit"), true);
  assert.match(surface, /Live cloud model smoke test/);
  assert.match(surface, /It never reads the note, profile, results, or chat/);
  assert.match(surface, /Cancel probe/);
  assert.match(surface, /role="status" aria-atomic="true"/);
  assert.match(surface, /cloud-probe-progress" aria-hidden="true"/);
  assert.match(surface, /Maximum 3 checks per 10 minutes/);
  assert.match(verifier, /method: "POST"/);
  assert.doesNotMatch(verifier, /body:/);
  assert.match(verifier, /containsHealthInformation !== false/);
  assert.match(verifier, /storesModelContent !== false/);
  assert.match(css, /cloud-probe-actions button \{ min-height: 44px/);
  assert.match(css, /cloud-probe-receipt \{ grid-template-columns: 1fr/);
});

test("competition preflight is body-free, metadata-only, cancellable, and visibly partial", async () => {
  const [page, component, route, service, css] = await Promise.all([
    readFile(path.join(process.cwd(), "app/webmcp/page.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "app/webmcp/_components/CompetitionPreflight.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "app/api/demo/preflight/route.ts"), "utf8"),
    readFile(path.join(process.cwd(), "lib/demo/preflight.ts"), "utf8"),
    readFile(path.join(process.cwd(), "app/globals.css"), "utf8"),
  ]);
  assert.match(page, /<CompetitionPreflight \/>/);
  assert.match(component, /Run demo preflight/);
  assert.match(component, /partial/);
  assert.match(component, /Cancel preflight/);
  assert.match(component, /returnsTrialRecords === false/);
  assert.match(route, /hasDeclaredRequestBody/);
  assert.match(route, /bucket: "cloud-probe"/);
  assert.match(route, /request\.signal/);
  assert.match(service, /Promise\.allSettled/);
  assert.match(service, /returnsTrialRecords: false/);
  assert.match(service, /containsHealthInformation: false/);
  assert.match(service, /storesModelContent: false/);
  assert.doesNotMatch(service, /trials\.map|trial\.title|trial\.summary/);
  assert.match(css, /\.preflight-results/);
  assert.match(css, /grid-template-columns:\s*repeat\(3/);
});

test("competition evidence separates source-reported WebMCP implementations from local verification", async () => {
  const root = process.cwd();
  const page = await readFile(path.join(root, "app", "webmcp", "page.tsx"), "utf8");
  const landscape = await readFile(path.join(root, "lib", "webmcp", "implementationLandscape.ts"), "utf8");
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
  assert.match(page, /Implementation landscape/);
  assert.match(page, /Source-reported/);
  assert.match(page, /not a compatibility claim about the browser currently viewing this page/);
  assert.match(page, /webMcpImplementationLandscape\.auditedAt/);
  assert.match(page, /webMcpImplementationLandscape\.upstreamCommit/);
  assert.match(landscape, /ChatGPT Desktop/);
  assert.match(landscape, /Chrome 149/);
  assert.match(landscape, /Brave Leo/);
  assert.match(landscape, /not treat these entries as local runtime verification/);
  assert.match(css, /implementation-grid \{ display: grid; grid-template-columns: repeat\(3/);
  assert.match(css, /implementation-grid article > div \{ min-height: 30px/);
  assert.match(css, /implementation-grid \{ grid-template-columns: 1fr/);
  assert.match(css, /implementation-grid article > div \{ min-height: 0/);
});
