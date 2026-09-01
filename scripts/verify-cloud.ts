export {};

const baseUrl = new URL(process.env.TRIALBRIDGE_BASE_URL ?? "http://localhost:3001");
const response = await fetch(new URL("/api/cloud/probe", baseUrl), {
  method: "POST",
  signal: AbortSignal.timeout(35_000),
});
const payload = await response.json() as {
  status?: string;
  requestedModel?: string;
  reportedModel?: string;
  transport?: string;
  inference?: string;
  latencyMs?: number;
  checkedAt?: string;
  timeoutMs?: number;
  persisted?: boolean;
  containsHealthInformation?: boolean;
  storesModelContent?: boolean;
  error?: string;
  code?: string;
};

if (!response.ok) throw new Error(`${payload.code ?? "CLOUD_PROBE_FAILED"}: ${payload.error ?? `HTTP ${response.status}`}`);
if (
  payload.status !== "ready"
  || payload.requestedModel !== "gpt-oss:120b-cloud"
  || typeof payload.reportedModel !== "string"
  || payload.transport !== "localhost_ollama_proxy"
  || payload.inference !== "remote-cloud-only"
  || typeof payload.latencyMs !== "number"
  || payload.timeoutMs !== 30_000
  || payload.persisted !== false
  || payload.containsHealthInformation !== false
  || payload.storesModelContent !== false
) {
  throw new Error("Cloud probe returned an invalid metadata receipt.");
}

console.log(JSON.stringify({
  baseUrl: baseUrl.origin,
  status: payload.status,
  requestedModel: payload.requestedModel,
  reportedModel: payload.reportedModel,
  transport: payload.transport,
  inference: payload.inference,
  latencyMs: payload.latencyMs,
  checkedAt: payload.checkedAt,
  timeoutMs: payload.timeoutMs,
  containsHealthInformation: false,
  storesModelContent: false,
}, null, 2));
