/* ============================================================================
   POST /api/trials  —  live ClinicalTrials.gov proxy

   Seam #2 (the raw registry search). The browser can't call ClinicalTrials.gov
   directly (no CORS), so this route proxies it server-side and returns
   normalized Trial[]. Used for direct browsing / verification; the full
   reasoning path is /api/match.

   POST, not GET, and deliberately so. The search term here is a condition — a
   patient's diagnosis. In a query string it is written to the host's request
   logs, referrer headers, and browser history as a matter of course, none of
   which are places health data should come to rest for a convenience endpoint.
   A body is not secret, but it is not logged by default either.
   ========================================================================== */

import { NextResponse } from "next/server";
import { searchTrials } from "@/lib/ctgov";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { cond?: string; status?: string; pageSize?: number };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const cond = (body.cond ?? "").trim();
  if (!cond) {
    return NextResponse.json({ error: "'cond' is required." }, { status: 400 });
  }
  const status = body.status ?? "RECRUITING";
  const pageSize = Math.min(Number(body.pageSize) || 30, 100);

  try {
    const trials = await searchTrials({ cond, status, pageSize });
    return NextResponse.json({ count: trials.length, trials });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ClinicalTrials.gov request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
