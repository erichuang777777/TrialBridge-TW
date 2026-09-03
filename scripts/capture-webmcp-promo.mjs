/**
 * Captures the quickstart page plus the browser-side WebMCP runtime state
 * (`document.modelContext`, discovered tool names, console output) into
 * artifacts/webmcp-promo/. See scripts/lib/webmcp-browser.mjs for the
 * environment variables that select the origin and the Chrome build.
 *
 *   node scripts/capture-webmcp-promo.mjs
 *   TRIALBRIDGE_BASE_URL=http://localhost:3001 node scripts/capture-webmcp-promo.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { launchChromium, siteUrl } from "./lib/webmcp-browser.mjs";

const out = "artifacts/webmcp-promo";
await mkdir(out, { recursive: true });
const browser = await launchChromium();
const context = await browser.newContext({
  recordVideo: { dir: out, size: { width: 1440, height: 1000 } },
  viewport: { width: 1440, height: 1000 },
  colorScheme: "light",
});
const page = await context.newPage();
const consoleLines = [];
page.on("console", (message) => consoleLines.push(`[${message.type()}] ${message.text()}`));
await page.goto(siteUrl("/webmcp/quickstart"), { waitUntil: "networkidle", timeout: 60000 });
await page.screenshot({ path: `${out}/quickstart.png`, fullPage: true });
const runtime = await page.evaluate(async () => {
  const modelContext = document.modelContext;
  const tools = modelContext && typeof modelContext.getTools === "function"
    ? await modelContext.getTools({ fromOrigins: [location.origin] })
    : [];
  const policy = document.featurePolicy ?? document.permissionsPolicy;
  return {
    origin: location.origin,
    modelContext: typeof modelContext,
    executeTool: typeof modelContext?.executeTool,
    tools: tools.map((tool) => tool.name),
    originTrialMetaPresent: Boolean(document.querySelector('meta[http-equiv="origin-trial"]')),
    toolsPolicyRecognized: typeof policy?.features === "function" ? policy.features().includes("tools") : null,
  };
});
await context.close();
await browser.close();
await writeFile(`${out}/runtime.json`, JSON.stringify({ capturedAt: new Date().toISOString(), runtime, consoleLines }, null, 2));
console.log(JSON.stringify(runtime));
