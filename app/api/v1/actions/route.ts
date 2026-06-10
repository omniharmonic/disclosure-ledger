/** GET /api/v1/actions — official government actions query. */
import type { NextRequest } from "next/server";
import { listActions } from "@/lib/queries";
import { apiOk, apiServerError, parseQuery, actionsQuery } from "@/lib/api";
import { enforceRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await enforceRateLimit(req);
  if (gate.rejection) return gate.rejection;
  const parsed = parseQuery(new URL(req.url), actionsQuery);
  if (!parsed.ok) return parsed.response;
  const q = parsed.params;
  try {
    const { rows, total } = await listActions(q);
    return apiOk(rows, { total, page: q.page, totalPages: Math.ceil(total / q.limit) }, gate.headers);
  } catch (err) {
    return apiServerError("actions", err);
  }
}
