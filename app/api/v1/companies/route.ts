/** GET /api/v1/companies — companies in the dataset with aggregates. */
import type { NextRequest } from "next/server";
import { listCompanies } from "@/lib/queries";
import { apiOk, apiServerError } from "@/lib/api";
import { enforceRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await enforceRateLimit(req);
  if (gate.rejection) return gate.rejection;
  try {
    const rows = await listCompanies();
    return apiOk(rows, { total: rows.length }, gate.headers);
  } catch (err) {
    return apiServerError("companies", err);
  }
}
