import { createHash } from "node:crypto";

export interface RateLimitPolicy {
  bucket: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();
const maxTrackedWindows = 10_000;

function requestFingerprint(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "loopback-or-unknown";
  return createHash("sha256").update(address).digest("hex").slice(0, 24);
}

function purgeExpired(now: number) {
  if (windows.size < maxTrackedWindows) return;
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }
  while (windows.size >= maxTrackedWindows) {
    const oldestKey = windows.keys().next().value as string | undefined;
    if (!oldestKey) break;
    windows.delete(oldestKey);
  }
}

export function consumeRateLimit(request: Request, policy: RateLimitPolicy, now = Date.now()): RateLimitResult {
  purgeExpired(now);
  const key = `${policy.bucket}:${requestFingerprint(request)}`;
  let entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + policy.windowMs };
    windows.set(key, entry);
  }

  const allowed = entry.count < policy.limit;
  if (allowed) entry.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1_000));
  return {
    allowed,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - entry.count),
    retryAfterSeconds,
    resetAt: entry.resetAt,
  };
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json({
    error: "Too many requests. Please wait before retrying.",
    code: "RATE_LIMITED",
    retryAfterSeconds: result.retryAfterSeconds,
  }, {
    status: 429,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": String(result.retryAfterSeconds),
      "RateLimit-Limit": String(result.limit),
      "RateLimit-Remaining": String(result.remaining),
      "RateLimit-Reset": String(result.retryAfterSeconds),
      "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1_000)),
    },
  });
}
