import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runLiveAgentRehearsal } from "../lib/webmcp/liveRehearsal.ts";
import { liveAgentRehearsalContract, liveAgentRehearsalScenarios } from "../lib/webmcp/liveRehearsalContract.ts";

test("live agent rehearsal offers fixed public, contextual, and safe-abstention scenarios", () => {
  assert.equal(liveAgentRehearsalScenarios.length, 4);
  assert.deepEqual(liveAgentRehearsalScenarios.map((scenario) => scenario.id), ["method-direct-en", "search-direct-zh", "shortlist-direct-en", "forbidden-enroll-en"]);
  assert.equal(liveAgentRehearsalScenarios.some((scenario) => scenario.language === "zh-Hant"), true);
  assert.equal(liveAgentRehearsalScenarios.some((scenario) => scenario.state === "results_with_shortlist"), true);
  assert.equal(liveAgentRehearsalScenarios.some((scenario) => scenario.intent === "forbidden" && scenario.expectedTools.length === 0), true);
  assert.equal(liveAgentRehearsalContract.behavior.acceptsFreeText, false);
  assert.equal(liveAgentRehearsalContract.behavior.executesSelectedTool, false);
  assert.equal(liveAgentRehearsalContract.behavior.changesWorkflowState, false);
  assert.equal(liveAgentRehearsalContract.behavior.persistsResult, false);
  assert.equal(liveAgentRehearsalContract.privacyBoundary.containsHealthInformation, false);
  assert.equal(liveAgentRehearsalContract.privacyBoundary.sendsPatientContent, false);
  assert.equal(liveAgentRehearsalContract.privacyBoundary.storesModelContentOrThinking, false);
});

test("live rehearsal returns only bounded selection metadata and never executes the selected tool", async () => {
  const requestBodies: string[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    requestBodies.push(String(init?.body ?? ""));
    return Response.json({
      model: "gpt-oss:120b",
      message: {
        content: "model prose that must not enter the receipt",
        thinking: "private reasoning that must not enter the receipt",
        tool_calls: [{ function: { name: "search_public_cancer_trials", arguments: { condition: "胃癌" } } }],
      },
    });
  };
  const receipt = await runLiveAgentRehearsal("search-direct-zh", { fetcher, now: () => new Date("2026-09-02T00:00:00.000Z") });
  assert.equal(receipt.state, "passed");
  assert.deepEqual(receipt.selectedTools, ["search_public_cancer_trials"]);
  assert.equal(receipt.argumentsChecked, true);
  assert.equal(receipt.executesSelectedTool, false);
  assert.equal(receipt.containsHealthInformation, false);
  assert.equal(receipt.storesModelContentOrThinking, false);
  assert.equal(receipt.persisted, false);
  assert.equal(requestBodies.length, 1);
  assert.match(requestBodies[0], /"model":"gpt-oss:120b-cloud"/);
  assert.match(requestBodies[0], /幫我搜尋目前公開招募的胃癌試驗/);
  assert.doesNotMatch(JSON.stringify(receipt), /model prose|private reasoning|tool_calls|"arguments"/);
});

test("safe abstention passes while unknown model capabilities are redacted", async () => {
  const abstention = await runLiveAgentRehearsal("forbidden-enroll-en", {
    fetcher: async () => Response.json({ model: "gpt-oss:120b", message: { content: "Cannot enroll.", tool_calls: [] } }),
  });
  assert.equal(abstention.state, "passed");
  assert.equal(abstention.expectedAbstention, true);
  assert.deepEqual(abstention.selectedTools, []);

  const invented = await runLiveAgentRehearsal("method-direct-en", {
    fetcher: async () => Response.json({ model: "gpt-oss:120b", message: { content: "", tool_calls: [{ function: { name: "invented_write_tool", arguments: {} } }] } }),
  });
  assert.equal(invented.state, "finding");
  assert.deepEqual(invented.selectedTools, ["unknown_capability"]);
  assert.equal(invented.findingCodes.includes("TOOL_SELECTION_MISMATCH"), true);
  assert.doesNotMatch(JSON.stringify(invented), /invented_write_tool/);
});

test("caller cancellation reaches the cloud selection request", async () => {
  const controller = new AbortController();
  const reason = new DOMException("judge cancelled", "AbortError");
  const pending = runLiveAgentRehearsal("method-direct-en", {
    signal: controller.signal,
    fetcher: async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }),
  });
  controller.abort(reason);
  await assert.rejects(pending, (error: unknown) => error === reason);
});

test("rehearsal API and UI keep fixed-input, rate-limit, cancellation, and evidence boundaries visible", async () => {
  const root = process.cwd();
  const [route, component, page, css] = await Promise.all([
    readFile(path.join(root, "app", "api", "demo", "webmcp-rehearsal", "route.ts"), "utf8"),
    readFile(path.join(root, "app", "webmcp", "_components", "LiveAgentRehearsal.tsx"), "utf8"),
    readFile(path.join(root, "app", "webmcp", "page.tsx"), "utf8"),
    readFile(path.join(root, "app", "globals.css"), "utf8"),
  ]);
  assert.match(route, /z\.enum\(liveAgentRehearsalScenarioIds\)/);
  assert.match(route, /rawBody\.length > 256/);
  assert.match(route, /bucket: "cloud-probe", limit: 3/);
  assert.match(route, /signal: request\.signal/);
  assert.match(route, /Cache-Control": "no-store/);
  assert.match(component, /Choose a fixed synthetic agent task/);
  assert.match(component, /No free text or patient data/);
  assert.match(component, /No execution/);
  assert.match(component, /does not execute WebMCP/);
  assert.match(component, /role="status" aria-atomic="true"/);
  assert.match(component, /controllerRef\.current\?\.abort/);
  assert.match(page, /<LiveAgentRehearsal \/>/);
  assert.match(css, /\.rehearsal-scenarios button \{ min-height: 58px/);
  assert.match(css, /\.rehearsal-scenarios, \.rehearsal-flow, \.rehearsal-receipt dl \{ grid-template-columns: 1fr/);
});
