/** GET /api/v1/export/transactions.csv — bulk CSV snapshot (FR-API5). */
import type { NextRequest } from "next/server";
import { iterateAllTransactions, type TransactionRow } from "@/lib/queries";
import { enforceRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const COLUMNS: (keyof TransactionRow)[] = [
  "id",
  "rowNumber",
  "transactionDate",
  "transactionType",
  "descriptionRaw",
  "ticker",
  "companyName",
  "sector",
  "amountBand",
  "amountMin",
  "amountMax",
  "notificationLate",
  "filingId",
  "filingDate",
  "sourceUrl",
];

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const gate = await enforceRateLimit(req);
  if (gate.rejection) return gate.rejection;

  const encoder = new TextEncoder();
  const iterator = iterateAllTransactions();
  let headerSent = false;
  const stream = new ReadableStream({
    async pull(controller) {
      if (!headerSent) {
        controller.enqueue(encoder.encode(COLUMNS.join(",") + "\n"));
        headerSent = true;
      }
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      const lines = value
        .map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))
        .join("\n");
      controller.enqueue(encoder.encode(lines + "\n"));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="transactions.csv"',
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      ...gate.headers,
    },
  });
}
