/** GET /api/v1/statements — public statement corpus query. */
import type { NextRequest } from "next/server";
import { listStatements } from "@/lib/queries";
import { apiOk, apiServerError, parseQuery, statementsQuery } from "@/lib/api";
import { enforceRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await enforceRateLimit(req);
  if (gate.rejection) return gate.rejection;
  const parsed = parseQuery(new URL(req.url), statementsQuery);
  if (!parsed.ok) return parsed.response;
  const q = parsed.params;
  try {
    const { rows, total } = await listStatements(q);
    return apiOk(rows, { total, page: q.page, totalPages: Math.ceil(total / q.limit) }, gate.headers);
  } catch (err) {
    return apiServerError("statements", err);
  }
}
