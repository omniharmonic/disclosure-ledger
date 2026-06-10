/** GET /api/v1/companies/:ticker — company profile, trades, prices, correlations. */
import type { NextRequest } from "next/server";
import { getCompany } from "@/lib/queries";
import { apiOk, apiError, apiServerError } from "@/lib/api";
import { enforceRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const gate = await enforceRateLimit(req);
  if (gate.rejection) return gate.rejection;
  try {
    const { ticker } = await params;
    if (!/^[A-Za-z.\-]{1,12}$/.test(ticker)) return apiError("invalid ticker", 400);
    const data = await getCompany(decodeURIComponent(ticker).toUpperCase());
    if (!data) return apiError("company not found", 404);
    return apiOk(data, {}, gate.headers);
  } catch (err) {
    return apiServerError("companies/:ticker", err);
  }
}
