import assert from "node:assert/strict";
import test from "node:test";
import { validatedCloudModel } from "../lib/llm/cloud.ts";
import { describeOllamaTransport, resolveOllamaEndpoint, resolveOllamaTransport } from "../lib/llm/ollama.ts";

test("without a key the endpoint is the loopback proxy and the -cloud model label", () => {
  const endpoint = resolveOllamaEndpoint({});
  assert.equal(endpoint.transport, "localhost_ollama_proxy");
  assert.equal(endpoint.chatUrl.toString(), "http://127.0.0.1:11434/api/chat");
  assert.deepEqual(endpoint.headers, {});
  assert.equal(endpoint.model, "gpt-oss:120b-cloud");
  assert.equal(endpoint.inference, "remote-cloud-only");
  assert.equal(resolveOllamaEndpoint({ OLLAMA_BASE_URL: "http://localhost:11434" }).chatUrl.hostname, "localhost");
});

test("without a key a non-loopback base URL is rejected", () => {
  assert.throws(() => resolveOllamaEndpoint({ OLLAMA_BASE_URL: "https://ollama.com" }), /loopback/);
  assert.throws(() => resolveOllamaEndpoint({ OLLAMA_BASE_URL: "http://10.0.0.5:11434" }), /loopback/);
});

test("with a key the endpoint is exactly the Ollama Cloud API with a bearer header", () => {
  const endpoint = resolveOllamaEndpoint({ OLLAMA_API_KEY: "abcdefghijklmnop1234" });
  assert.equal(endpoint.transport, "ollama_cloud_api");
  assert.equal(endpoint.chatUrl.toString(), "https://ollama.com/api/chat");
  assert.deepEqual(endpoint.headers, { Authorization: "Bearer abcdefghijklmnop1234" });
  assert.equal(endpoint.model, "gpt-oss:120b");
  assert.equal(resolveOllamaEndpoint({ OLLAMA_API_KEY: "abcdefghijklmnop1234", OLLAMA_BASE_URL: "https://ollama.com" }).transport, "ollama_cloud_api");
});

test("a key can never be sent anywhere except ollama.com", () => {
  assert.throws(() => resolveOllamaEndpoint({ OLLAMA_API_KEY: "abcdefghijklmnop1234", OLLAMA_BASE_URL: "https://example.com" }), /ollama\.com/);
  assert.throws(() => resolveOllamaEndpoint({ OLLAMA_API_KEY: "abcdefghijklmnop1234", OLLAMA_BASE_URL: "http://127.0.0.1:11434" }), /ollama\.com/);
  assert.throws(() => resolveOllamaEndpoint({ OLLAMA_API_KEY: "abcdefghijklmnop1234", OLLAMA_BASE_URL: "http://ollama.com" }), /ollama\.com/);
  assert.throws(() => resolveOllamaEndpoint({ OLLAMA_API_KEY: "short key" }), /invalid shape/);
});

test("the model allowlist accepts both labels of the same hosted model and nothing else", () => {
  assert.equal(validatedCloudModel(undefined, {}), "gpt-oss:120b-cloud");
  assert.equal(validatedCloudModel("gpt-oss:120b", {}), "gpt-oss:120b-cloud");
  assert.equal(validatedCloudModel("gpt-oss:120b-cloud", { OLLAMA_API_KEY: "abcdefghijklmnop1234" }), "gpt-oss:120b");
  assert.throws(() => validatedCloudModel("llama3", {}), /gpt-oss:120b-cloud/);
  assert.throws(() => validatedCloudModel("gpt-oss:20b", { OLLAMA_API_KEY: "abcdefghijklmnop1234" }), /gpt-oss:120b-cloud/);
});

test("transport descriptions never include the key or URL", () => {
  assert.equal(resolveOllamaTransport({ OLLAMA_API_KEY: "abcdefghijklmnop1234" }), "ollama_cloud_api");
  assert.equal(resolveOllamaTransport({}), "localhost_ollama_proxy");
  assert.equal(describeOllamaTransport("ollama_cloud_api").proxyBoundary, "https-provider-api");
  assert.equal(describeOllamaTransport("localhost_ollama_proxy").proxyBoundary, "loopback-server-proxy");
  assert.doesNotMatch(JSON.stringify(describeOllamaTransport("ollama_cloud_api")), /abcdefghijklmnop1234|Bearer/);
});
