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

test("rate limiting prefers the platform client address header and scales only under the demo profile", async () => {
  const { applyRateLimitProfile, resolveRateLimitProfile } = await import("../lib/security/rateLimit.ts");
  const policy = { bucket: "cloud-extract", limit: 8, windowMs: 10_000 };
  assert.equal(resolveRateLimitProfile(undefined), "strict");
  assert.equal(resolveRateLimitProfile("demo"), "demo");
  assert.throws(() => resolveRateLimitProfile("open"), /strict or demo/);
  assert.deepEqual(applyRateLimitProfile(policy, "strict"), policy);
  assert.equal(applyRateLimitProfile(policy, "demo").limit, 32);
  assert.equal(applyRateLimitProfile({ bucket: "trial-search", limit: 60, windowMs: 1 }, "demo").limit, 60);

  const platform = new Request("http://localhost/api/test", { headers: { "x-nf-client-connection-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.8" } });
  const forwardedOnly = new Request("http://localhost/api/test", { headers: { "x-forwarded-for": "203.0.113.8" } });
  const separate = { bucket: "unit-platform-address", limit: 1, windowMs: 10_000 };
  assert.equal(consumeRateLimit(platform, separate, 5_000).allowed, true);
  assert.equal(consumeRateLimit(platform, separate, 5_001).allowed, false, "same platform address shares a bucket");
  assert.equal(consumeRateLimit(forwardedOnly, separate, 5_002).allowed, true, "a different resolved address is a different bucket");
});
