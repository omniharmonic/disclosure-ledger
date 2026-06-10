/**
 * GET /api/v1/export/transactions.ndjson — bulk snapshot for researchers
 * (FR-API5). Streams one JSON object per line, paged from the database so the
 * full dataset is never held in memory.
 */
import type { NextRequest } from "next/server";
import { iterateAllTransactions } from "@/lib/queries";
import { enforceRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await enforceRateLimit(req);
  if (gate.rejection) return gate.rejection;

  const encoder = new TextEncoder();
  const iterator = iterateAllTransactions();
  const stream = new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(value.map((r) => JSON.stringify(r)).join("\n") + "\n"));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": 'attachment; filename="transactions.ndjson"',
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      ...gate.headers,
    },
  });
}
