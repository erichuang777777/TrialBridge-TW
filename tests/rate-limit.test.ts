import assert from "node:assert/strict";
import test from "node:test";
import { consumeRateLimit, rateLimitResponse } from "../lib/security/rateLimit.ts";

test("rate limiting is scoped by endpoint and a hashed request address", () => {
  const request = new Request("http://localhost/api/test", { headers: { "x-forwarded-for": "203.0.113.8" } });
  const policy = { bucket: "unit-rate-limit", limit: 2, windowMs: 10_000 };
  assert.deepEqual(consumeRateLimit(request, policy, 1_000), { allowed: true, limit: 2, remaining: 1, retryAfterSeconds: 10, resetAt: 11_000 });
  assert.equal(consumeRateLimit(request, policy, 1_001).allowed, true);
  const blocked = consumeRateLimit(request, policy, 1_002);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(consumeRateLimit(request, policy, 11_000).allowed, true);
});

test("rate-limit response is machine-readable and tells clients when to retry", async () => {
  const response = rateLimitResponse({ allowed: false, limit: 8, remaining: 0, retryAfterSeconds: 37, resetAt: 38_000 });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "37");
  assert.equal(response.headers.get("ratelimit-limit"), "8");
  assert.deepEqual(await response.json(), { error: "Too many requests. Please wait before retrying.", code: "RATE_LIMITED", retryAfterSeconds: 37 });
});
