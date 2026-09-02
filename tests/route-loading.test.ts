import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("main product routes expose one accessible no-fake-progress loading system", async () => {
  const [component, match, trials, webmcp, css, designSystem] = await Promise.all([
    readFile("app/components/RouteLoading.tsx", "utf8"),
    readFile("app/match/loading.tsx", "utf8"),
    readFile("app/trials/loading.tsx", "utf8"),
    readFile("app/webmcp/loading.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
    readFile("design-system/trialbridge-tw/MASTER.md", "utf8"),
  ]);

  for (const source of [match, trials, webmcp]) assert.match(source, /<RouteLoading/);
  for (const marker of ['aria-busy="true"', 'role="status"', 'aria-live="polite"', 'aria-atomic="true"', "No estimated percentage is shown", 'href="/"']) {
    assert.ok(component.includes(marker), `route loading component is missing ${marker}`);
  }
  assert.doesNotMatch(component, /(?:progress|complete|percent)(?:age)?\s*[:=]\s*\d+/i);
  assert.match(css, /@keyframes route-loading-turn/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.route-loading-status > span i/);
  assert.match(css, /\.route-loading-shell[^}]*min-height:/);
  assert.match(designSystem, /shows no fake percentage or completion estimate/);
});
