/* ============================================================================
   Demo access gate (privacy audit #4, #10)

   robots.txt and the noindex/nofollow metadata stop the demo being *discovered*.
   They do nothing about the demo being *reached* — a shared link works fine, and
   behind that link is an intake that invites medical records plus five
   unauthenticated endpoints that each spend real Anthropic tokens.

   So: one shared passcode, checked here, covering pages and `/api/*` alike.

   It is off unless `DEMO_PASSCODE` is set. That is deliberate — a gate that
   silently locked out an existing deployment on upgrade would be a worse bug
   than the one it fixes. Set the variable to turn it on; leave it unset and this
   file costs a string comparison per request.

   This is a shared-secret demo gate. It is not authentication, it is not
   per-user, and it is not a substitute for the access control a production
   deployment would need — it exists so a link cannot be casually forwarded.
   ========================================================================== */

import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "trial_demo_key";

// Next 16 renamed this convention from `middleware` to `proxy`; same contract.
export default function proxy(req: NextRequest) {
  const expected = process.env.DEMO_PASSCODE;
  if (!expected) return NextResponse.next();

  // ?key=… lets a link carry the passcode once; we move it to a cookie and
  // redirect so the secret does not linger in history, logs, or a referrer.
  const provided = req.nextUrl.searchParams.get("key");
  if (provided && timingSafeEqual(provided, expected)) {
    const clean = req.nextUrl.clone();
    clean.searchParams.delete("key");
    const res = NextResponse.redirect(clean);
    res.cookies.set(COOKIE, expected, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  }

  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie && timingSafeEqual(cookie, expected)) return NextResponse.next();

  // An API caller gets a status code, not a wall of HTML it cannot use.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "This demo is not publicly available." }, { status: 401 });
  }
  return new NextResponse(WALL, { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/** Compare without leaking length or position through timing. Node's crypto is
 *  not available on the edge runtime, so this is written out. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const WALL = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Trialign — private demo</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#F7F5F2;color:#1C1B1A;
       font:400 17px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}
  .c{max-width:26rem;text-align:center}
  h1{font-size:22px;font-weight:600;letter-spacing:-.01em;margin:0 0 8px}
  p{color:#57544F;margin:0 0 20px}
  form{display:flex;gap:8px}
  input{flex:1;min-height:48px;padding:0 14px;border:0;border-radius:8px;background:#EFECE7;color:inherit;font:inherit}
  input:focus{outline:2px solid #3D6BB3;outline-offset:2px}
  button{min-height:48px;padding:0 20px;border:0;border-radius:12px;color:#fff;font:600 16px/1 inherit;cursor:pointer;
         background:linear-gradient(135deg,#3BA394 0%,#3C87A4 54%,#3D6BB3 100%)}
  @media(prefers-color-scheme:dark){body{background:#141A1E;color:#F2F1EF}p{color:#9BA4A9}input{background:#1E262C}}
</style></head>
<body><div class="c">
  <h1>Private demo</h1>
  <p>Trialign isn't open to the public yet. Enter the passcode you were given.</p>
  <form method="GET"><input name="key" type="password" placeholder="Passcode" aria-label="Passcode" autofocus>
  <button type="submit">Enter</button></form>
</div></body></html>`;

export const config = {
  // Everything except Next's own static output and the public files that have to
  // stay reachable for the passcode wall itself to render and behave.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|images/).*)"],
};
