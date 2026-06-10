/** Shared helpers for the public API (`/api/v1/*`). */
import { NextResponse } from "next/server";
import { z } from "zod";

export interface ApiMeta {
  total?: number;
  page?: number;
  totalPages?: number;
  [k: string]: unknown;
}

/** Consistent JSON envelope so the website and API never diverge. */
export function apiOk<T>(
  data: T,
  meta: ApiMeta = {},
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    { data, meta: { ...meta, generatedAt: new Date().toISOString() } },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300", ...headers } },
  );
}

export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Log the real error server-side, return a generic message to the caller —
 * driver/column internals must never reach a public response.
 */
export function apiServerError(context: string, err: unknown): NextResponse {
  console.error(`[api] ${context}:`, err);
  return apiError("internal error — the query could not be completed", 500);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Common, strictly-validated query parameters. */
export const dateParam = z.string().regex(ISO_DATE, "expected YYYY-MM-DD");
export const pageParam = z.coerce.number().int().min(1).default(1);
export const limitParam = z.coerce.number().int().min(1).max(200).default(50);
export const uuidParam = z.string().uuid();

export const transactionsQuery = z.object({
  search: z.string().max(120).optional(),
  type: z.enum(["Purchase", "Sale", "Sale (Partial)", "Exchange"]).optional(),
  dateFrom: dateParam.optional(),
  dateTo: dateParam.optional(),
  bandMin: z.coerce.number().int().min(1).max(10).optional(),
  sortBy: z.enum(["date", "amount", "description"]).default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: pageParam,
  limit: limitParam,
});

export const statementsQuery = z.object({
  dateFrom: dateParam.optional(),
  dateTo: dateParam.optional(),
  channel: z.string().max(40).optional(),
  ticker: z.string().max(12).optional(),
  page: pageParam,
  limit: limitParam,
});

export const actionsQuery = z.object({
  dateFrom: dateParam.optional(),
  dateTo: dateParam.optional(),
  type: z.string().max(40).optional(),
  ticker: z.string().max(12).optional(),
  page: pageParam,
  limit: limitParam,
});

export const correlationsQuery = z.object({
  transactionId: uuidParam.optional(),
  ticker: z.string().max(12).optional(),
  kind: z.enum(["statement", "action"]).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  page: pageParam,
  limit: limitParam,
});

/**
 * Parse and validate a route's query string against a zod schema. Returns the
 * parsed params, or a ready-to-return 400 response describing what was wrong
 * (field names only — no echoed values, no internals).
 */
export function parseQuery<S extends z.ZodTypeAny>(
  url: URL,
  schema: S,
): { ok: true; params: z.infer<S> } | { ok: false; response: NextResponse } {
  const raw = Object.fromEntries(
    [...url.searchParams.entries()].filter(([, v]) => v !== ""),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".")))]
      .filter(Boolean)
      .join(", ");
    return {
      ok: false,
      response: apiError(`invalid query parameter${fields ? `(s): ${fields}` : "s"}`, 400),
    };
  }
  return { ok: true, params: parsed.data };
}
