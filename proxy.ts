import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// AI agents issue a CORS preflight before invoking a tool from another origin.
// Keep this boundary explicit for every API route so new tool endpoints do not
// accidentally return a framework 405 to OPTIONS.
const corsHeaders = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return {
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "600",
  Vary: "Origin",
  ...(origin ? { "Access-Control-Allow-Credentials": "true" } : {}),
};
};

export function proxy(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders(request))) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/.well-known/webmcp"],
};
