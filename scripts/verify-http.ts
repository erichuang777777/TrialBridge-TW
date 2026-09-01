export {};

const baseUrl = process.env.TRIALBRIDGE_BASE_URL ?? "http://localhost:3001";
const paths = ["/", "/trials", "/webmcp", "/webmcp/evidence.json", "/method", "/privacy", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/opengraph-image", "/twitter-image", "/api/health"];
const results = [];
for (const path of paths) {
  const response = await fetch(`${baseUrl}${path}`);
  const contentType = response.headers.get("content-type") ?? "";
  const expectedType = path.endsWith(".txt") ? "text/plain" : path.endsWith(".xml") ? "application/xml" : path.endsWith(".json") || path.startsWith("/api/") ? "application/json" : path.endsWith(".webmanifest") ? "application/manifest+json" : path.includes("image") ? "image/png" : "text/html";
  results.push({ path, status: response.status, contentType, expectedType, noSniff: response.headers.get("x-content-type-options"), permissionsPolicy: response.headers.get("permissions-policy") });
  if (!response.ok || !contentType.includes(expectedType) || response.headers.get("x-content-type-options") !== "nosniff") process.exitCode = 1;
}
console.log(JSON.stringify({ baseUrl, results }, null, 2));
