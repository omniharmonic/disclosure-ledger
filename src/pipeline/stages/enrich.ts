/**
 * Stage 6 — Enrich.
 *
 * Resolves equity transaction descriptions to a ticker + company via the SEC
 * EDGAR `company_tickers.json` map, creating `companies` rows and linking
 * transactions. Most of the President's disclosed 278-T transactions are
 * municipal bonds, which legitimately do not resolve to a ticker — those are
 * left unlinked rather than force-matched.
 *
 * Price enrichment (Tiingo / FMP) activates when the corresponding API keys
 * are configured; without them, transactions keep null prices.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/db";
import { companies, filings, transactions } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { fetchJson } from "../lib/http";

const CACHE_DIR = join(process.cwd(), "data", "cache");
const EDGAR_URL = "https://www.sec.gov/files/company_tickers.json";

interface EdgarEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

/** Words that mark a description as a bond/fund rather than a common stock. */
const NON_EQUITY = /\b(DUE|REV|B\/E|OID|CTF|RFDG|RFUNDING|MUN|MTN|NOTE|BOND|GO\b|G\/O|SER\b|@\d)/i;

function normalizeName(s: string): string {
  return s
    .toUpperCase()
    .replace(/\b(THE|COM|COMMON|STOCK|CL\s?[A-C]|INC|CORP|CORPORATION|CO|COMPANY|LTD|PLC|HOLDINGS?|GROUP|N\.?V\.?|S\.?A\.?)\b/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadEdgarMap(): Promise<Map<string, EdgarEntry>> {
  await mkdir(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, "company_tickers.json");
  let raw: Record<string, EdgarEntry>;
  try {
    raw = JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    raw = await fetchJson<Record<string, EdgarEntry>>(EDGAR_URL);
    await writeFile(cachePath, JSON.stringify(raw));
  }
  const byName = new Map<string, EdgarEntry>();
  for (const e of Object.values(raw)) {
    const key = normalizeName(e.title);
    if (key && !byName.has(key)) byName.set(key, e);
  }
  return byName;
}

export interface EnrichResult {
  resolved: number;
  unresolved: number;
  bondsSkipped: number;
}

/** Resolve tickers for unlinked transactions in public filings. */
export async function enrichTransactions(): Promise<EnrichResult> {
  const edgar = await loadEdgarMap();
  const result: EnrichResult = { resolved: 0, unresolved: 0, bondsSkipped: 0 };

  const pending = await db
    .select({ id: transactions.id, desc: transactions.descriptionRaw })
    .from(transactions)
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .where(and(isNull(transactions.companyId), inArray(filings.status, ["parsed", "published"])));

  // Cache company rows created this run to avoid duplicate inserts.
  const companyByTicker = new Map<string, string>();

  for (const txn of pending) {
    if (NON_EQUITY.test(txn.desc)) {
      result.bondsSkipped++;
      continue;
    }
    const key = normalizeName(txn.desc);
    let match: EdgarEntry | undefined = edgar.get(key);
    if (!match) {
      // Prefix match: "DATADOG" resolves "DATADOG INC CL A COM".
      for (const [name, entry] of edgar) {
        if (name.length >= 4 && (key.startsWith(name + " ") || key === name)) {
          match = entry;
          break;
        }
      }
    }
    if (!match) {
      result.unresolved++;
      continue;
    }

    let companyId = companyByTicker.get(match.ticker);
    if (!companyId) {
      const existing = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.ticker, match.ticker))
        .limit(1);
      if (existing[0]) {
        companyId = existing[0].id;
      } else {
        const [row] = await db
          .insert(companies)
          .values({
            name: match.title,
            ticker: match.ticker,
            cik: String(match.cik_str).padStart(10, "0"),
          })
          .returning({ id: companies.id });
        companyId = row.id;
      }
      companyByTicker.set(match.ticker, companyId);
    }
    await db
      .update(transactions)
      .set({ companyId })
      .where(eq(transactions.id, txn.id));
    result.resolved++;
  }
  return result;
}
