/** GET /api/v1/openapi.json — the OpenAPI 3.1 specification (FR-API4). */
import { NextResponse } from "next/server";
import { OPENAPI_SPEC } from "@/lib/openapi";

export function GET() {
  return NextResponse.json(OPENAPI_SPEC, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
