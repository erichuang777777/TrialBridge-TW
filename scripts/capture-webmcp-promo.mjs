import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "file:///C:/Users/TaiHao/AppData/Roaming/npm/node_modules/playwright/index.mjs";

const out = "artifacts/webmcp-promo";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const context = await browser.newContext({
  recordVideo: { dir: out, size: { width: 1440, height: 1000 } },
  viewport: { width: 1440, height: 1000 },
  colorScheme: "light",
});
const page = await context.newPage();
const consoleLines = [];
page.on("console", (message) => consoleLines.push(`[${message.type()}] ${message.text()}`));
await page.goto("https://trialbridge-tw.netlify.app/webmcp/quickstart", { waitUntil: "networkidle", timeout: 60000 });
await page.screenshot({ path: `${out}/quickstart.png`, fullPage: true });
const runtime = await page.evaluate(async () => {
  const modelContext = document.modelContext;
  const tools = modelContext && typeof modelContext.getTools === "function"
    ? await modelContext.getTools({ fromOrigins: [location.origin] })
    : [];
  return {
    origin: location.origin,
    modelContext: typeof modelContext,
    executeTool: typeof modelContext?.executeTool,
    tools: tools.map((tool) => tool.name),
  };
});
await context.close();
await browser.close();
await writeFile(`${out}/runtime.json`, JSON.stringify({ capturedAt: new Date().toISOString(), runtime, consoleLines }, null, 2));
console.log(JSON.stringify(runtime));
