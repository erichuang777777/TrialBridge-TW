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

/**
 * `strict` is the MVP default. `demo` widens the model-backed buckets so a
 * room of judges behind one office address does not exhaust each other's
 * allowance during a review; it never removes a limit.
 */
export type RateLimitProfile = "strict" | "demo";

const demoMultipliers: Record<string, number> = {
  "cloud-extract": 4,
  "cloud-probe": 3,
  "cloud-intake": 2,
  "cloud-dialogue": 2,
  matches: 3,
};

export function resolveRateLimitProfile(value = process.env.RATE_LIMIT_PROFILE): RateLimitProfile {
  const normalized = value?.trim().toLocaleLowerCase("en");
  if (!normalized || normalized === "strict") return "strict";
  if (normalized === "demo") return "demo";
  throw new Error("RATE_LIMIT_PROFILE must be strict or demo");
}

export function applyRateLimitProfile(policy: RateLimitPolicy, profile: RateLimitProfile = resolveRateLimitProfile()): RateLimitPolicy {
  if (profile === "strict") return policy;
  const multiplier = demoMultipliers[policy.bucket] ?? 1;
  return { ...policy, limit: policy.limit * multiplier };
}

const windows = new Map<string, WindowEntry>();
const maxTrackedWindows = 10_000;

/**
 * Client address for bucketing. Hosted platforms put the verified client
 * address in their own header (Netlify: x-nf-client-connection-ip) before any
 * forwarded chain the client could have supplied; a trusted reverse proxy
 * overwrites x-forwarded-for. The raw address is hashed and never stored.
 */
function requestFingerprint(request: Request): string {
  const platform = request.headers.get("x-nf-client-connection-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = platform || forwarded || request.headers.get("x-real-ip")?.trim() || "loopback-or-unknown";
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

export function consumeRateLimit(request: Request, requestedPolicy: RateLimitPolicy, now = Date.now()): RateLimitResult {
  const policy = applyRateLimitProfile(requestedPolicy);
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
