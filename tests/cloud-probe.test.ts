import assert from "node:assert/strict";
import test from "node:test";
import { cloudProbeTimeoutMs, CloudProbeError, probeCloudModel } from "../lib/llm/cloudProbe.ts";

test("cloud probe sends fixed synthetic content and returns metadata without model text", async () => {
  let sent = "";
  const times = [100, 342];
  const result = await probeCloudModel({
    fetcher: (async (input, init) => {
      assert.equal(new URL(input.toString()).hostname, "127.0.0.1");
      sent = String(init?.body);
      return Response.json({ model: "gpt-oss:120b", message: { content: "{\"status\":\"ready\"}" }, done: true, done_reason: "stop" });
    }) as typeof fetch,
    now: () => times.shift() ?? 342,
    checkedAt: () => new Date("2026-09-02T00:00:00.000Z"),
  });
  assert.match(sent, /"model":"gpt-oss:120b-cloud"/);
  assert.match(sent, /"think":"low"/);
  assert.match(sent, /"num_predict":128/);
  assert.match(sent, /fixed synthetic availability probe/i);
  assert.doesNotMatch(sent, /rawText|maskedText|profile|trialResult|patient/i);
  assert.deepEqual(result, {
    status: "ready", requestedModel: "gpt-oss:120b-cloud", reportedModel: "gpt-oss:120b",
    transport: "localhost_ollama_proxy", inference: "remote-cloud-only", latencyMs: 242,
    checkedAt: "2026-09-02T00:00:00.000Z", timeoutMs: cloudProbeTimeoutMs, persisted: false, containsHealthInformation: false, storesModelContent: false,
  });
  assert.equal(Object.hasOwn(result, "message"), false);
  assert.equal(Object.hasOwn(result, "content"), false);
  assert.equal(Object.hasOwn(result, "thinking"), false);
});

test("cloud probe rejects an invalid provider response", async () => {
  await assert.rejects(() => probeCloudModel({ fetcher: (async () => Response.json({ model: "gpt-oss:120b", message: { content: "not json" } })) as typeof fetch }),
    (error: unknown) => error instanceof CloudProbeError && error.code === "CLOUD_PROBE_INVALID_RESPONSE");
});

test("cloud probe classifies bounded cancellation without leaking provider details", async () => {
  await assert.rejects(() => probeCloudModel({ fetcher: (async () => { throw new DOMException("cancelled", "AbortError"); }) as typeof fetch }),
    (error: unknown) => error instanceof CloudProbeError && error.code === "CLOUD_PROBE_TIMEOUT" && /30-second limit/.test(error.message));
});

test("cloud probe reports the Ollama Cloud API transport when a server-only key is configured", async () => {
  const previous = process.env.OLLAMA_API_KEY;
  process.env.OLLAMA_API_KEY = "test-cloud-api-key-0123456789";
  try {
    let authorization: string | null = null;
    const result = await probeCloudModel({
      fetcher: (async (input, init) => {
        assert.equal(input.toString(), "https://ollama.com/api/chat");
        authorization = new Headers(init?.headers).get("authorization");
        return Response.json({ model: "gpt-oss:120b", message: { content: "{\"status\":\"ready\"}" }, done: true, done_reason: "stop" });
      }) as typeof fetch,
    });
    assert.equal(authorization, "Bearer test-cloud-api-key-0123456789");
    assert.equal(result.transport, "ollama_cloud_api");
    assert.equal(result.requestedModel, "gpt-oss:120b");
    assert.equal(JSON.stringify(result).includes("test-cloud-api-key"), false);
  } finally {
    if (previous === undefined) delete process.env.OLLAMA_API_KEY; else process.env.OLLAMA_API_KEY = previous;
  }
});
