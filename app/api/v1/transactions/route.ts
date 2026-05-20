/**
 * GET /api/v1/transactions — public, read-only transaction query.
 *
 * Query params: search, type, dateFrom, dateTo, bandMin, sortBy, order,
 * page, limit. Returns only transactions from publicly-released filings.
 */
import type { NextRequest } from "next/server";
import { listTransactions } from "@/lib/queries";
import { apiOk, apiError, pagination } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const { page, limit } = pagination(url);
  const sortBy = url.searchParams.get("sortBy");
  const order = url.searchParams.get("order");

  try {
    const { rows, total } = await listTransactions({
      search: url.searchParams.get("search") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      bandMin: url.searchParams.get("bandMin")
        ? Number(url.searchParams.get("bandMin"))
        : undefined,
      sortBy: sortBy === "amount" || sortBy === "description" ? sortBy : "date",
      order: order === "asc" ? "asc" : "desc",
      page,
      limit,
    });
    return apiOk(rows, { total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    return apiError(`query failed: ${String(err)}`, 500);
  }
}
