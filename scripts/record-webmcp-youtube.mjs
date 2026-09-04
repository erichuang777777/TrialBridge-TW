/**
 * Records a slow walkthrough of the public pages into artifacts/webmcp-youtube/
 * for the demo video. See scripts/lib/webmcp-browser.mjs for the environment
 * variables that select the origin and the Chrome build.
 *
 *   node scripts/record-webmcp-youtube.mjs
 */
import { mkdir } from "node:fs/promises";
import { launchChromium, siteUrl } from "./lib/webmcp-browser.mjs";

const out = "artifacts/webmcp-youtube";
await mkdir(out, { recursive: true });
const browser = await launchChromium();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: out, size: { width: 1920, height: 1080 } },
  colorScheme: "light",
});
const page = await context.newPage();
page.on("pageerror", (error) => console.log(`[pageerror] ${error.message}`));

const pause = (ms) => page.waitForTimeout(ms);
await page.goto(siteUrl("/"), { waitUntil: "networkidle", timeout: 60000 });
await pause(10000);

await page.goto(siteUrl("/webmcp/quickstart"), { waitUntil: "networkidle", timeout: 60000 });
await pause(15000);
for (let i = 0; i < 3; i += 1) {
  await page.mouse.wheel(0, 700);
  await pause(5000);
}

await page.goto(siteUrl("/trials"), { waitUntil: "networkidle", timeout: 60000 });
await pause(10000);
const condition = page.locator("input").first();
if (await condition.count()) {
  await condition.fill("breast cancer");
  await pause(2000);
  const searchButton = page.getByRole("button", { name: /search/i }).first();
  if (await searchButton.count()) await searchButton.click();
  await pause(25000);
}
await page.mouse.wheel(0, 800);
await pause(5000);

await page.goto(siteUrl("/webmcp"), { waitUntil: "networkidle", timeout: 60000 });
await pause(10000);
for (let i = 0; i < 3; i += 1) {
  await page.mouse.wheel(0, 700);
  await pause(4000);
}
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await pause(6000);

await context.close();
await browser.close();
console.log("recorded");
