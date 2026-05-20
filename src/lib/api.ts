/** Shared helpers for the public API (`/api/v1/*`). */
import { NextResponse } from "next/server";

export interface ApiMeta {
  total?: number;
  page?: number;
  totalPages?: number;
  [k: string]: unknown;
}

/** Consistent JSON envelope so the website and API never diverge. */
export function apiOk<T>(data: T, meta: ApiMeta = {}): NextResponse {
  return NextResponse.json(
    { data, meta: { ...meta, generatedAt: new Date().toISOString() } },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}

export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Parse common pagination params. */
export function pagination(url: URL): { page: number; limit: number } {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50));
  return { page, limit };
}
