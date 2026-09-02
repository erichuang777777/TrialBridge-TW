import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { webMcpBrowserSetupContract, webMcpLocalTestingFlag } from "../lib/webmcp/browserSetup.ts";

test("browser setup separates the standard, native preview, site, and optional Inspector", () => {
  assert.equal(webMcpLocalTestingFlag, "chrome://flags/#enable-webmcp-testing");
  assert.equal(webMcpBrowserSetupContract.visitorInstallRequired, false);
  assert.equal(webMcpBrowserSetupContract.localTesting.minimumChromeMajor, 149);
  assert.equal(webMcpBrowserSetupContract.localTesting.flagAddress, webMcpLocalTestingFlag);
  assert.deepEqual(webMcpBrowserSetupContract.layers.map((layer) => layer.id), ["specification", "browser", "trialbridge"]);
  assert.equal(webMcpBrowserSetupContract.inspector.separateFromWebMcp, true);
  assert.equal(webMcpBrowserSetupContract.inspector.optionalForVisitors, true);
  assert.equal(webMcpBrowserSetupContract.privacyBoundary.containsHealthInformation, false);
  assert.equal(webMcpBrowserSetupContract.privacyBoundary.readsBrowserState, false);
  assert.equal(webMcpBrowserSetupContract.privacyBoundary.executesTools, false);
});

test("setup UI provides one-click copy feedback without turning onboarding into a gate", async () => {
  const root = process.cwd();
  const component = await readFile(path.join(root, "app", "webmcp", "_components", "WebMcpBrowserSetup.tsx"), "utf8");
  const bridge = await readFile(path.join(root, "app", "components", "WebMcpBridge.tsx"), "utf8");
  const diagnostic = await readFile(path.join(root, "app", "webmcp", "_components", "WebMcpDiagnostics.tsx"), "utf8");
  const inspector = await readFile(path.join(root, "app", "webmcp", "_components", "InspectorAcceptanceKit.tsx"), "utf8");
  assert.match(component, /WebMCP itself has nothing to install/);
  assert.match(component, /No extension required/);
  assert.match(component, /navigator\.clipboard\.writeText\(webMcpLocalTestingFlag\)/);
  assert.match(component, /role="status" aria-atomic="true"/);
  assert.match(component, /Inspector is separate and optional/);
  assert.match(component, /Copy is unavailable/);
  assert.doesNotMatch(`${bridge}\n${diagnostic}\n${inspector}`, /chrome:\/\/flags\/#enable-webmcp-testing/);
});
