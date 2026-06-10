/** GET /api/v1/correlations — scored (trade ↔ event) pairs with full components. */
import type { NextRequest } from "next/server";
import { listCorrelations } from "@/lib/queries";
import { apiOk, apiServerError, parseQuery, correlationsQuery } from "@/lib/api";
import { enforceRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await enforceRateLimit(req);
  if (gate.rejection) return gate.rejection;
  const parsed = parseQuery(new URL(req.url), correlationsQuery);
  if (!parsed.ok) return parsed.response;
  const q = parsed.params;
  try {
    const { rows, total } = await listCorrelations(q);
    return apiOk(rows, { total, page: q.page, totalPages: Math.ceil(total / q.limit) }, gate.headers);
  } catch (err) {
    return apiServerError("correlations", err);
  }
}
