/**
 * HTTP Basic Auth for the operator surface (/admin/*).
 *
 * Enabled only when ADMIN_PASSWORD is set (ADMIN_USER defaults to "admin");
 * without it /admin does not exist (404) — the public deployment exposes no
 * authentication surface unless the operator opts in.
 */
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return NextResponse.rewrite(new URL("/not-found", req.url), { status: 404 });
  }
  const user = process.env.ADMIN_USER ?? "admin";

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    // atob, not Buffer — middleware executes on the Edge runtime.
    let decoded = "";
    try {
      decoded = atob(encoded);
    } catch {
      /* malformed base64 → fall through to the 401 */
    }
    const idx = decoded.indexOf(":");
    if (idx > 0) {
      const u = decoded.slice(0, idx);
      const p = decoded.slice(idx + 1);
      if (u === user && p === password) return NextResponse.next();
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="disclosure-ledger operator"' },
  });
}

export const config = {
  matcher: ["/admin/:path*"],
};
