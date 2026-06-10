/**
 * GET /api/v1/transactions — public, read-only transaction query.
 *
 * Query params: search, type, dateFrom, dateTo, bandMin, sortBy, order,
 * page, limit. Returns only transactions from publicly-released filings.
 */
import type { NextRequest } from "next/server";
import { listTransactions } from "@/lib/queries";
import { apiOk, apiServerError, parseQuery, transactionsQuery } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const parsed = parseQuery(new URL(req.url), transactionsQuery);
  if (!parsed.ok) return parsed.response;
  const q = parsed.params;

  try {
    const { rows, total } = await listTransactions(q);
    return apiOk(rows, {
      total,
      page: q.page,
      totalPages: Math.ceil(total / q.limit),
    });
  } catch (err) {
    return apiServerError("transactions", err);
  }
}
