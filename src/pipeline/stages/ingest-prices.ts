/**
 * Stage 6b — Ingest stock prices.
 *
 * Two free sources, each used for what its free tier allows:
 *   • History (the chart): Alpha Vantage TIME_SERIES_WEEKLY — full weekly
 *     history, free, but capped at 25 calls/day. Tickers are fetched in
 *     correlation-priority order, ~24 per run, skipping any already cached —
 *     so coverage fills in progressively over the daily pipeline runs.
 *   • Current price: Finnhub /quote — 60 calls/min, no daily cap — refreshed
 *     every run for every ticker that has cached history.
 *
 * Requires ALPHAVANTAGE_API_KEY and FINNHUB_API_KEY. Without them the stage is
 * a logged no-op and price-dependent UI degrades gracefully.
 */
import { db } from "@/db";
import { companies, transactions, filings, priceCache, correlations } from "@/db/schema";
import { and, eq, inArray, isNotNull, sql, desc, lte } from "drizzle-orm";
import { fetchJson, redactUrl } from "../lib/http";

const ALPHA_KEY = process.env.ALPHAVANTAGE_API_KEY ?? "";
const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? "";
/** Alpha Vantage free tier hard cap is 25 requests/day. */
const HISTORY_BUDGET = 24;

interface PriceRow {
  date: string;
  close: number;
}

interface AvWeekly {
  "Weekly Time Series"?: Record<string, { "4. close": string }>;
  Information?: string;
  Note?: string;
}

interface FinnhubQuote {
  c?: number; // current price
}

function parseAvWeekly(json: AvWeekly): PriceRow[] {
  const series = json["Weekly Time Series"];
  if (!series) return [];
  const rows: PriceRow[] = [];
  for (const [date, v] of Object.entries(series)) {
    const close = Number(v["4. close"]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(close) && close > 0) {
      // Only keep history relevant to the disclosure window.
      if (date >= "2024-06-01") rows.push({ date, close: Math.round(close * 100) / 100 });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export interface PricesResult {
  historyFetched: number;
  pricePoints: number;
  currentRefreshed: number;
  transactionsPriced: number;
  errors: string[];
}

export async function ingestPrices(): Promise<PricesResult> {
  const result: PricesResult = {
    historyFetched: 0,
    pricePoints: 0,
    currentRefreshed: 0,
    transactionsPriced: 0,
    errors: [],
  };
  if (!ALPHA_KEY && !FINNHUB_KEY) {
    console.log("[ingest-prices] skipped — no ALPHAVANTAGE_API_KEY / FINNHUB_API_KEY");
    return result;
  }

  // Tickers in the dataset, correlation-priority order.
  const tickerRows = await db
    .select({
      ticker: companies.ticker,
      corr: sql<number>`count(distinct ${correlations.id})`,
    })
    .from(companies)
    .innerJoin(transactions, eq(transactions.companyId, companies.id))
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .leftJoin(correlations, eq(correlations.transactionId, transactions.id))
    .where(and(isNotNull(companies.ticker), inArray(filings.status, ["parsed", "published"])))
    .groupBy(companies.ticker)
    .orderBy(desc(sql`count(distinct ${correlations.id})`));
  const tickers = tickerRows.map((r) => r.ticker!).filter(Boolean);

  // --- history pass (Alpha Vantage weekly, budget-limited) ----------------
  const cached = new Set(
    (await db.selectDistinct({ t: priceCache.ticker }).from(priceCache)).map((r) => r.t),
  );
  if (ALPHA_KEY) {
    let budget = HISTORY_BUDGET;
    for (const ticker of tickers) {
      if (budget <= 0) break;
      if (cached.has(ticker)) continue;
      budget--;
      try {
        const json = await fetchJson<AvWeekly>(
          `https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY&symbol=${encodeURIComponent(ticker)}&apikey=${ALPHA_KEY}`,
          { retries: 1, timeoutMs: 25_000 },
        );
        if (json.Information || json.Note) {
          result.errors.push(`Alpha Vantage rate limit reached at ${ticker}`);
          break; // daily cap hit — stop, the rest fill in tomorrow
        }
        const rows = parseAvWeekly(json);
        if (rows.length === 0) {
          result.errors.push(`${ticker}: no weekly data`);
          continue;
        }
        await db
          .insert(priceCache)
          .values(rows.map((r) => ({ ticker, priceDate: r.date, closePrice: r.close })))
          .onConflictDoNothing({ target: [priceCache.ticker, priceCache.priceDate] });
        result.historyFetched++;
        result.pricePoints += rows.length;
        cached.add(ticker);
      } catch (err) {
        result.errors.push(`${ticker}: ${redactUrl(String(err))}`);
      }
    }
  }

  // --- current-price pass (Finnhub quote, tickers that have history) ------
  const currentByTicker = new Map<string, number>();
  if (FINNHUB_KEY) {
    for (const ticker of tickers) {
      if (!cached.has(ticker)) continue;
      try {
        const q = await fetchJson<FinnhubQuote>(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_KEY}`,
          { retries: 1, timeoutMs: 15_000 },
        );
        if (q.c && q.c > 0) {
          currentByTicker.set(ticker, Math.round(q.c * 100) / 100);
          result.currentRefreshed++;
          // Record today's quote in the cache so the chart ends at "now".
          await db
            .insert(priceCache)
            .values({
              ticker,
              priceDate: new Date().toISOString().slice(0, 10),
              closePrice: q.c,
            })
            .onConflictDoNothing({ target: [priceCache.ticker, priceCache.priceDate] });
        }
      } catch (err) {
        result.errors.push(`${ticker} quote: ${redactUrl(String(err))}`);
      }
    }
  }

  // --- stamp transactions -------------------------------------------------
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
    if (!t.ticker || !cached.has(t.ticker)) continue;
    const at = await db
      .select({ close: priceCache.closePrice })
      .from(priceCache)
      .where(and(eq(priceCache.ticker, t.ticker), lte(priceCache.priceDate, t.date)))
      .orderBy(desc(priceCache.priceDate))
      .limit(1);
    if (!at[0]) continue;
    const priceAt = at[0].close;
    const priceNow =
      currentByTicker.get(t.ticker) ??
      (
        await db
          .select({ close: priceCache.closePrice })
          .from(priceCache)
          .where(eq(priceCache.ticker, t.ticker))
          .orderBy(desc(priceCache.priceDate))
          .limit(1)
      )[0]?.close;
    if (!priceNow) continue;
    await db
      .update(transactions)
      .set({
        priceAtTxn: priceAt,
        priceCurrent: priceNow,
        priceCurrentDate: new Date().toISOString().slice(0, 10),
        gainLossPct:
          priceAt > 0 ? Math.round(((priceNow - priceAt) / priceAt) * 1000) / 10 : null,
      })
      .where(eq(transactions.id, t.id));
    result.transactionsPriced++;
  }

  console.log(
    `[ingest-prices] ${result.historyFetched} ticker histories (+${result.pricePoints} points), ` +
      `${result.currentRefreshed} current quotes, ${result.transactionsPriced} transactions priced`,
  );
  return result;
}

export async function pricePointCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(priceCache);
  return Number(row?.n ?? 0);
}
