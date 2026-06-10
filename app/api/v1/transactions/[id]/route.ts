/** GET /api/v1/transactions/:id — one public transaction + its correlations. */
import type { NextRequest } from "next/server";
import { getTransaction, getCorrelations } from "@/lib/queries";
import { apiOk, apiError, apiServerError } from "@/lib/api";
import { enforceRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await enforceRateLimit(req);
  if (gate.rejection) return gate.rejection;
  try {
    const { id } = await params;
    const txn = await getTransaction(id);
    if (!txn) return apiError("transaction not found", 404);
    const correlations = await getCorrelations(id);
    return apiOk({ ...txn, correlations }, {}, gate.headers);
  } catch (err) {
    return apiServerError("transactions/:id", err);
  }
}
