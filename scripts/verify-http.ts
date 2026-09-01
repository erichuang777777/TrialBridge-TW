export {};

const baseUrl = process.env.TRIALBRIDGE_BASE_URL ?? "http://localhost:3001";
const paths = ["/", "/trials", "/method", "/privacy", "/robots.txt", "/api/health"];
const results = [];
for (const path of paths) {
  const response = await fetch(`${baseUrl}${path}`);
  results.push({ path, status: response.status, contentType: response.headers.get("content-type"), noSniff: response.headers.get("x-content-type-options"), permissionsPolicy: response.headers.get("permissions-policy") });
  if (!response.ok || response.headers.get("x-content-type-options") !== "nosniff") process.exitCode = 1;
}
console.log(JSON.stringify(results, null, 2));
