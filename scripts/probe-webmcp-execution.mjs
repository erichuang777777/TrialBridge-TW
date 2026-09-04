/**
 * Executes the two public WebMCP tools through the browser's
 * `document.modelContext.executeTool` and prints the outcome. See
 * scripts/lib/webmcp-browser.mjs for the environment variables that select
 * the origin and the Chrome build.
 *
 *   node scripts/probe-webmcp-execution.mjs
 */
import { launchChromium, siteUrl } from "./lib/webmcp-browser.mjs";

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("console", (message) => console.log(`[console:${message.type()}] ${message.text()}`));
await page.goto(siteUrl(`/webmcp/quickstart?probe=${Date.now().toString(36)}`), { waitUntil: "networkidle", timeout: 60000 });
const result = await page.evaluate(async () => {
  const modelContext = document.modelContext;
  if (!modelContext || typeof modelContext.getTools !== "function") {
    return { error: "document.modelContext is unavailable in this browser; enable the WebMCP preview or serve a valid origin-trial token." };
  }
  const tools = await modelContext.getTools({ fromOrigins: [location.origin] });
  const output = {};
  for (const name of ["trialbridge_method", "search_public_cancer_trials"]) {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) {
      output[name] = { ok: false, error: "tool not discovered" };
      continue;
    }
    const input = name === "trialbridge_method" ? {} : { condition: "breast cancer" };
    try {
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
