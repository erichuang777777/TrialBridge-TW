import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), tools=(self)",
  },
];

const runtimeTrialIndexFiles = [
  "./var/trial-index/trials.sqlite",
  "./var/trial-index/trials.sqlite-wal",
  "./var/trial-index/trials.sqlite-shm",
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  outputFileTracingExcludes: {
    "/": runtimeTrialIndexFiles,
    "/*": runtimeTrialIndexFiles,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
