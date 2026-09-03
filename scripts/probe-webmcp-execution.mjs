import { chromium } from "file:///C:/Users/TaiHao/AppData/Roaming/npm/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("console", (message) => console.log(`[console:${message.type()}] ${message.text()}`));
await page.goto("https://trialbridge-tw.netlify.app/webmcp/quickstart?probe=a8044d7", { waitUntil: "networkidle", timeout: 60000 });
const result = await page.evaluate(async () => {
  const modelContext = document.modelContext;
  const tools = await modelContext.getTools({ fromOrigins: [location.origin] });
  const output = {};
  for (const name of ["trialbridge_method", "search_public_cancer_trials"]) {
    const tool = tools.find((candidate) => candidate.name === name);
    try {
      const input = name === "trialbridge_method" ? {} : { condition: "breast cancer" };
      const value = await modelContext.executeTool(tool, JSON.stringify(input));
      output[name] = { ok: true, value };
    } catch (error) {
      output[name] = { ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
      if (name === "search_public_cancer_trials" && typeof tool.execute === "function") {
        try {
          output[name].direct = await tool.execute(input, { signal: new AbortController().signal });
        } catch (directError) {
          output[name].directError = directError instanceof Error ? `${directError.name}: ${directError.message}` : String(directError);
        }
      }
    }
  }
  return output;
});
await browser.close();
console.log(JSON.stringify(result, null, 2));
