/**
 * Ollama endpoint resolution.
 *
 * Two transports are allowed, and nothing in between:
 *
 * - `localhost_ollama_proxy`: the developer's own Ollama on a loopback address,
 *   signed in to Ollama cloud, serving `gpt-oss:120b-cloud`. No API key.
 * - `ollama_cloud_api`: Ollama's hosted API at https://ollama.com with a
 *   server-only bearer key, serving `gpt-oss:120b`. Used by deployments that
 *   have no local Ollama (for example Netlify Functions).
 *
 * A key with any host other than ollama.com, or a non-loopback URL without a
 * key, is rejected so the key can never be sent to an arbitrary server and a
 * misconfiguration can never silently route medical text elsewhere.
 * Inference is remote-cloud-only on both transports.
 */

export type OllamaTransport = "localhost_ollama_proxy" | "ollama_cloud_api";

export type OllamaEnvironment = Partial<Record<"OLLAMA_BASE_URL" | "OLLAMA_API_KEY" | "OLLAMA_CLOUD_MODEL", string>>;

export interface OllamaEndpoint {
  transport: OllamaTransport;
  /** Fully resolved `/api/chat` URL. */
  chatUrl: URL;
  /** Extra request headers; contains the bearer key only for the cloud API. */
  headers: Record<string, string>;
  /** Wire model name for this transport. */
  model: string;
  inference: "remote-cloud-only";
}

export const ollamaCloudApiOrigin = "https://ollama.com";
export const defaultLoopbackBaseUrl = "http://127.0.0.1:11434";

/** The same hosted model has a different label on each transport. */
export const requiredCloudModelByTransport: Record<OllamaTransport, string> = {
  localhost_ollama_proxy: "gpt-oss:120b-cloud",
  ollama_cloud_api: "gpt-oss:120b",
};

/** Labels accepted in OLLAMA_CLOUD_MODEL; both name the same hosted model. */
export const acceptedCloudModelLabels = new Set(Object.values(requiredCloudModelByTransport));

export function validatedLoopbackBaseUrl(value = process.env.OLLAMA_BASE_URL ?? defaultLoopbackBaseUrl): URL {
  const url = new URL(value);
  const allowedHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (url.protocol !== "http:" || !allowedHosts.has(url.hostname) || url.username || url.password) {
    throw new Error("Ollama base URL must be an unauthenticated HTTP loopback address");
  }
  return url;
}

function validatedCloudApiBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("OLLAMA_BASE_URL must be an absolute URL");
  }
  if (url.origin !== ollamaCloudApiOrigin || url.username || url.password) {
    throw new Error(`OLLAMA_API_KEY may only be used with ${ollamaCloudApiOrigin}`);
  }
  return url;
}

export function resolveOllamaTransport(environment: OllamaEnvironment = process.env as OllamaEnvironment): OllamaTransport {
  return environment.OLLAMA_API_KEY?.trim() ? "ollama_cloud_api" : "localhost_ollama_proxy";
}

export function resolveOllamaEndpoint(environment: OllamaEnvironment = process.env as OllamaEnvironment): OllamaEndpoint {
  const apiKey = environment.OLLAMA_API_KEY?.trim();
  if (apiKey) {
    if (/\s/.test(apiKey) || apiKey.length < 16) throw new Error("OLLAMA_API_KEY has an invalid shape");
    const base = validatedCloudApiBaseUrl(environment.OLLAMA_BASE_URL?.trim() || ollamaCloudApiOrigin);
    return {
      transport: "ollama_cloud_api",
      chatUrl: new URL("/api/chat", base),
      headers: { Authorization: `Bearer ${apiKey}` },
      model: requiredCloudModelByTransport.ollama_cloud_api,
      inference: "remote-cloud-only",
    };
  }
  const base = validatedLoopbackBaseUrl(environment.OLLAMA_BASE_URL?.trim() || defaultLoopbackBaseUrl);
  return {
    transport: "localhost_ollama_proxy",
    chatUrl: new URL("/api/chat", base),
    headers: {},
    model: requiredCloudModelByTransport.localhost_ollama_proxy,
    inference: "remote-cloud-only",
  };
}

/** Human-readable, key-free description for health and receipts. */
export function describeOllamaTransport(transport: OllamaTransport): { proxyBoundary: "loopback-server-proxy" | "https-provider-api"; label: string } {
  return transport === "ollama_cloud_api"
    ? { proxyBoundary: "https-provider-api", label: "Ollama Cloud API (HTTPS) → remote cloud inference" }
    : { proxyBoundary: "loopback-server-proxy", label: "localhost Ollama proxy → remote cloud inference" };
}

/** Request headers for one chat call: JSON plus the transport's auth, never logged. */
export function ollamaRequestHeaders(endpoint: OllamaEndpoint): Record<string, string> {
  return { "Content-Type": "application/json", ...endpoint.headers };
}
