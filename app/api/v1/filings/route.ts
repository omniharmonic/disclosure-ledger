/** GET /api/v1/filings — public list of parsed filings. */
import { listFilings } from "@/lib/queries";
import { apiOk, apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await listFilings();
    return apiOk(rows, { total: rows.length });
  } catch (err) {
    return apiError(`query failed: ${String(err)}`, 500);
  }
}
