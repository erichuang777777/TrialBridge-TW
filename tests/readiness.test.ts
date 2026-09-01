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
  const files = ["app/components/TrialBridgeChat.tsx", "lib/chat/state.ts", "lib/privacy/mask.ts"];
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

test("the public trial database is directly linked from the English-first home page", async () => {
  const root = process.cwd();
  const home = await readFile(path.join(root, "app", "page.tsx"), "utf8");
  const database = await readFile(path.join(root, "app", "trials", "page.tsx"), "utf8");
  assert.match(home, /href="\/trials"/);
  assert.match(database, /Search trial registries directly/);
});

test("trial cards expose a six-cell, four-state comparison without relying on color alone", async () => {
  const root = process.cwd();
  const component = await readFile(path.join(root, "app", "components", "TrialMatchCard.tsx"), "utf8");
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
  for (const criterion of ["condition", "recruitment", "age", "sex", "location", "eligibility_details"]) {
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
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
  assert.match(review, /Masked note sent to cloud/);
  assert.match(review, /Confirm all/);
  assert.match(clarification, /Before showing results/);
  assert.match(clarification, /I don't know/);
  assert.match(chat, /No known public-record difference/);
  assert.match(chat, /More information needed/);
  assert.match(chat, /Public-record differences found/);
  assert.match(chat, /Chat about the results/);
  assert.match(chat, /aria-pressed/);
  assert.match(css, /grid-template-rows:\s*subgrid/);
  assert.match(css, /result-chat-panel/);
});
