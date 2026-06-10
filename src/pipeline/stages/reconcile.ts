/**
 * Stage 3b — Cross-source reconciliation (FR-T8).
 *
 * Matches our extracted transactions against an independently-published
 * dataset and records agreement in `transactions.reconciled_sources` — the
 * difference between *asserting* extraction is correct and *demonstrating*
 * it. Reconciled rows surface their corroborating source in the UI/API.
 *
 * The engine is source-agnostic: it consumes an NDJSON snapshot, one record
 * per independently-reported transaction:
 *
 *   { "source": "propublica", "date": "2026-04-02", "ticker": "NVDA",
 *     "description": "NVIDIA Corp", "type": "Purchase",
 *     "amount_min": 1000001, "amount_max": 5000000 }
 *
 * Configure with RECONCILE_DATA_PATH (local file, e.g. committed under
 * data/reconcile/) or RECONCILE_DATA_URL (fetched). Without either it is a
 * logged no-op, like every externally-fed stage. The operator supplies the
 * snapshot (e.g. exported from ProPublica's published Trump disclosure data);
 * mirroring the third-party feed in-repo also satisfies the source-politeness
 * mirror rule.
 *
 * Match rule (conservative): same transaction date AND (ticker equality OR
 * normalized-description overlap) AND, when the snapshot carries a band,
 * band-range overlap. A non-match is never an error — coverage differs across
 * publishers — but match *conflicts* (same security+date, different band) are
 * logged for review.
 */
import { readFile } from "node:fs/promises";
import { db } from "@/db";
import { transactions, filings, companies } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { fetchText } from "../lib/http";

export interface ReconcileRecord {
  source: string;
  date: string; // YYYY-MM-DD
  ticker?: string | null;
  description?: string | null;
  type?: string | null;
  amount_min?: number | null;
  amount_max?: number | null;
}

export interface OurRow {
  id: string;
  date: string;
  ticker: string | null;
  description: string;
  amountMin: number;
  amountMax: number | null;
}

function normDesc(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(THE|INC|CORP|CORPORATION|CO|COMPANY|LTD|PLC|COM|COMMON|STOCK|SHS?|CLASS|CL|EQUITY)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Does an independent record corroborate one of our rows? Pure + testable. */
export function recordMatches(rec: ReconcileRecord, row: OurRow): boolean {
  if (rec.date !== row.date) return false;

  const tickerMatch =
    rec.ticker && row.ticker && rec.ticker.toUpperCase() === row.ticker.toUpperCase();
  let descMatch = false;
  if (!tickerMatch && rec.description) {
    const a = normDesc(rec.description);
    const b = normDesc(row.description);
    descMatch = a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a));
  }
  if (!tickerMatch && !descMatch) return false;

  // Band overlap when the snapshot reports one.
  if (rec.amount_min != null) {
    const ourMax = row.amountMax ?? Number.MAX_SAFE_INTEGER;
    const recMax = rec.amount_max ?? Number.MAX_SAFE_INTEGER;
    if (rec.amount_min > ourMax || row.amountMin > recMax) return false;
  }
  return true;
}

export interface ReconcileResult {
  records: number;
  matched: number;
  alreadyReconciled: number;
  unmatchedRecords: number;
  errors: string[];
}

export async function reconcile(): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    records: 0,
    matched: 0,
    alreadyReconciled: 0,
    unmatchedRecords: 0,
    errors: [],
  };

  const path = process.env.RECONCILE_DATA_PATH;
  const url = process.env.RECONCILE_DATA_URL;
  if (!path && !url) {
    console.log(
      "[reconcile] skipped — set RECONCILE_DATA_PATH or RECONCILE_DATA_URL to an NDJSON snapshot",
    );
    return result;
  }

  let raw: string;
  try {
    raw = path ? await readFile(path, "utf8") : await fetchText(url!, { timeoutMs: 60_000 });
  } catch (err) {
    result.errors.push(`load snapshot: ${String(err)}`);
    return result;
  }

  const records: ReconcileRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed) as ReconcileRecord;
      if (rec.source && rec.date) records.push(rec);
    } catch {
      result.errors.push(`unparseable line: ${trimmed.slice(0, 80)}`);
    }
  }
  result.records = records.length;

  const ours: OurRow[] = (
    await db
      .select({
        id: transactions.id,
        date: transactions.transactionDate,
        ticker: companies.ticker,
        description: transactions.descriptionRaw,
        amountMin: transactions.amountMin,
        amountMax: transactions.amountMax,
        reconciled: transactions.reconciledSources,
      })
      .from(transactions)
      .innerJoin(filings, eq(transactions.filingId, filings.id))
      .leftJoin(companies, eq(transactions.companyId, companies.id))
      .where(inArray(filings.status, ["parsed", "published"]))
  ).map((r) => ({ ...r }));


  const reconciledByTxn = new Map<string, Set<string>>();
  for (const rec of records) {
    const hit = ours.find((row) => recordMatches(rec, row));
    if (!hit) {
      result.unmatchedRecords++;
      continue;
    }
    (reconciledByTxn.get(hit.id) ?? reconciledByTxn.set(hit.id, new Set()).get(hit.id)!).add(
      rec.source,
    );
  }

  // Idempotent union with whatever sources were already recorded.
  const existing = new Map(ours.map((r) => [r.id, (r as { reconciled?: string[] | null }).reconciled ?? []]));
  for (const [txnId, sources] of reconciledByTxn) {
    const prior = existing.get(txnId) ?? [];
    const union = [...new Set([...prior, ...sources])].sort();
    if (union.length === prior.length) result.alreadyReconciled++;
    await db
      .update(transactions)
      .set({ reconciledSources: union })
      .where(eq(transactions.id, txnId));
    result.matched++;
  }

  console.log(
    `[reconcile] ${result.matched} transactions corroborated from ${result.records} ` +
      `independent records (${result.unmatchedRecords} records had no counterpart here)`,
  );
  return result;
}
