/**
 * Stage 6b — Ingest stock prices.
 *
 * Fetches daily end-of-day price history for every resolved company ticker
 * from Stooq — a free, no-API-key CSV endpoint — into `price_cache`, then
 * stamps each transaction with the close price on (or just before) its
 * transaction date, the latest close, and a gain/loss percentage.
 *
 * EOD is sufficient: disclosed trades carry a date, not a timestamp.
 */
import { db } from "@/db";
import { companies, transactions, filings, priceCache } from "@/db/schema";
import { and, eq, inArray, isNotNull, sql, desc, lte } from "drizzle-orm";
import { fetchJson } from "../lib/http";

/**
 * Price source. Financial Modeling Prep (free tier — instant key, 250
 * calls/day, ample for ~40 tickers) is the reliable path; Yahoo Finance's
 * keyless endpoint is a best-effort fallback (it rate-limits aggressively).
 * Set FMP_API_KEY to populate prices reliably.
 */
const FMP_KEY = process.env.FMP_API_KEY ?? "";
const YF_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface PriceRow {
  date: string;
  close: number;
}

interface FmpHistory {
  historical?: { date: string; close: number }[];
}

function parseFmp(json: FmpHistory): PriceRow[] {
  return (json.historical ?? [])
    .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date) && Number.isFinite(h.close) && h.close > 0)
    .map((h) => ({ date: h.date, close: Math.round(h.close * 100) / 100 }));
}

interface YahooChart {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[] }[] };
    }[];
  };
}

/** Fetch daily EOD history for a ticker — FMP when keyed, else Yahoo. */
async function fetchPriceHistory(ticker: string): Promise<PriceRow[]> {
  const t = encodeURIComponent(ticker.trim().toUpperCase());
  if (FMP_KEY) {
    const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${t}?from=2024-01-01&apikey=${FMP_KEY}`;
    return parseFmp(await fetchJson<FmpHistory>(url, { retries: 2, timeoutMs: 30_000 }));
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=2y&interval=1d`;
  return parseYahoo(
    await fetchJson<YahooChart>(url, { retries: 2, timeoutMs: 30_000, userAgent: YF_UA }),
  );
}

function parseYahoo(json: YahooChart): PriceRow[] {
  const r = json.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  const rows: PriceRow[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close) || close <= 0) continue;
    const date = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    rows.push({ date, close: Math.round(close * 100) / 100 });
  }
  return rows;
}

export interface PricesResult {
  tickers: number;
  pricePoints: number;
  transactionsPriced: number;
  errors: string[];
}

export async function ingestPrices(): Promise<PricesResult> {
  const result: PricesResult = { tickers: 0, pricePoints: 0, transactionsPriced: 0, errors: [] };

  const tickerRows = await db
    .selectDistinct({ ticker: companies.ticker })
    .from(companies)
    .innerJoin(transactions, eq(transactions.companyId, companies.id))
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .where(and(isNotNull(companies.ticker), inArray(filings.status, ["parsed", "published"])));

  for (const { ticker } of tickerRows) {
    if (!ticker) continue;
    try {
      const rows = await fetchPriceHistory(ticker);
      if (rows.length === 0) {
        result.errors.push(`${ticker}: no price data`);
        continue;
      }
      for (let i = 0; i < rows.length; i += 500) {
        await db
          .insert(priceCache)
          .values(
            rows.slice(i, i + 500).map((r) => ({
              ticker,
              priceDate: r.date,
              closePrice: r.close,
            })),
          )
          .onConflictDoNothing({ target: [priceCache.ticker, priceCache.priceDate] });
      }
      result.tickers++;
      result.pricePoints += rows.length;
    } catch (err) {
      result.errors.push(`${ticker}: ${String(err)}`);
    }
  }

  // Stamp transactions with price-at-trade, latest price, and gain/loss.
  const txns = await db
    .select({
      id: transactions.id,
      ticker: companies.ticker,
      date: transactions.transactionDate,
    })
    .from(transactions)
    .innerJoin(companies, eq(transactions.companyId, companies.id))
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .where(and(isNotNull(companies.ticker), inArray(filings.status, ["parsed", "published"])));

  for (const t of txns) {
    if (!t.ticker) continue;
    // close on or just before the transaction date
    const at = await db
      .select({ close: priceCache.closePrice })
      .from(priceCache)
      .where(and(eq(priceCache.ticker, t.ticker), lte(priceCache.priceDate, t.date)))
      .orderBy(desc(priceCache.priceDate))
      .limit(1);
    const latest = await db
      .select({ close: priceCache.closePrice, d: priceCache.priceDate })
      .from(priceCache)
      .where(eq(priceCache.ticker, t.ticker))
      .orderBy(desc(priceCache.priceDate))
      .limit(1);
    if (!at[0] || !latest[0]) continue;
    const priceAt = at[0].close;
    const priceNow = latest[0].close;
    await db
      .update(transactions)
      .set({
        priceAtTxn: priceAt,
        priceCurrent: priceNow,
        priceCurrentDate: latest[0].d,
        gainLossPct: priceAt > 0 ? Math.round(((priceNow - priceAt) / priceAt) * 1000) / 10 : null,
      })
      .where(eq(transactions.id, t.id));
    result.transactionsPriced++;
  }

  console.log(
    `[ingest-prices] ${result.tickers} tickers, ${result.pricePoints} price points, ` +
      `${result.transactionsPriced} transactions priced`,
  );
  return result;
}

export async function pricePointCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(priceCache);
  return Number(row?.n ?? 0);
}
