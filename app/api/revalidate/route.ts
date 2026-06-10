/**
 * GET /api/revalidate?secret=… — on-demand ISR refresh.
 *
 * The daily pipeline already calls $REVALIDATE_URL after a successful run
 * (.github/workflows/pipeline.yml); this is the endpoint that call expects.
 * Set REVALIDATE_SECRET in the web environment and use
 * `https://<site>/api/revalidate?secret=<value>` as the REVALIDATE_URL secret.
 */
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "revalidation not configured" }, { status: 503 });
  }
  const provided = new URL(req.url).searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }
  // Refresh every route — the pipeline writes to all surfaces at once.
  revalidatePath("/", "layout");
  return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}
