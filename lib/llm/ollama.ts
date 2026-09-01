export function validatedLoopbackBaseUrl(value = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"): URL {
  const url = new URL(value);
  const allowedHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (url.protocol !== "http:" || !allowedHosts.has(url.hostname) || url.username || url.password) {
    throw new Error("Ollama base URL must be an unauthenticated HTTP loopback address");
  }
  return url;
}
