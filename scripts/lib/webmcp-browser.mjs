/**
 * Shared, machine-independent browser launcher for the WebMCP capture and
 * probe scripts. Nothing here is imported by the application.
 *
 * Environment:
 *   TRIALBRIDGE_BASE_URL  origin to exercise (default: the public Netlify site)
 *   CHROME_PATH           explicit Chrome/Chromium executable; when unset the
 *                         installed Chrome channel is used (CHROME_CHANNEL,
 *                         default "chrome"), which is what a WebMCP origin
 *                         trial needs
 *   PLAYWRIGHT_MODULE     optional path/specifier of a playwright install to
 *                         use instead of the resolvable `playwright` or
 *                         `playwright-core` package
 */

export const baseUrl = (process.env.TRIALBRIDGE_BASE_URL ?? "https://trialbridge-tw.netlify.app").replace(/\/+$/, "");

export function siteUrl(pathname) {
  return new URL(pathname, `${baseUrl}/`).toString();
}

async function loadPlaywright() {
  const specifiers = [process.env.PLAYWRIGHT_MODULE, "playwright", "playwright-core"].filter(Boolean);
  const failures = [];
  for (const specifier of specifiers) {
    try {
      return await import(specifier);
    } catch (error) {
      failures.push(`${specifier}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No Playwright module could be loaded. Install one (npm i -D playwright-core) or set PLAYWRIGHT_MODULE.\n${failures.join("\n")}`);
}

export async function launchChromium(options = {}) {
  const { chromium } = await loadPlaywright();
  const executablePath = process.env.CHROME_PATH?.trim() || undefined;
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : { channel: process.env.CHROME_CHANNEL?.trim() || "chrome" }),
    ...options,
  });
}
