/** GET /api/v1/filings — public list of parsed filings. */
import type { NextRequest } from "next/server";
import { listFilings } from "@/lib/queries";
import { apiOk, apiServerError } from "@/lib/api";
import { enforceRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await enforceRateLimit(req);
  if (gate.rejection) return gate.rejection;
  try {
    const rows = await listFilings();
    return apiOk(rows, { total: rows.length }, gate.headers);
  } catch (err) {
    return apiServerError("filings", err);
  }
}
