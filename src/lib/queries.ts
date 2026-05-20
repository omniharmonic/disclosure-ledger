/**
 * Shared read queries. Used by both server components and the public API so
 * the website and the API never diverge.
 *
 * Only filings at status `parsed` or `published` (and their transactions) are
 * exposed publicly; `review` and `pending` filings are withheld until a human
 * confirms them (PRD FR-O3, NFR "Accuracy").
 */
import { db } from "@/db";
import { filings, transactions, companies } from "@/db/schema";
import { and, or, eq, gte, lte, ilike, desc, asc, sql, inArray, count } from "drizzle-orm";

export const PUBLIC_FILING_STATUSES = ["parsed", "published"] as const;

export interface TransactionFilter {
  search?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  bandMin?: number;
  sortBy?: "date" | "amount" | "description";
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface TransactionRow {
  id: string;
  rowNumber: number;
  descriptionRaw: string;
  transactionType: string;
  transactionDate: string;
  notificationLate: boolean | null;
  amountBand: number;
  amountMin: number;
  amountMax: number | null;
  ticker: string | null;
  companyName: string | null;
  sector: string | null;
  filingId: string;
  filingDate: string;
  sourceUrl: string;
}

const SORT_COLUMNS = {
  date: transactions.transactionDate,
  amount: transactions.amountBand,
  description: transactions.descriptionRaw,
} as const;

/** List transactions with filtering, sorting, pagination. */
export async function listTransactions(
  filter: TransactionFilter = {},
): Promise<{ rows: TransactionRow[]; total: number }> {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(200, Math.max(1, filter.limit ?? 50));

  const conds = [inArray(filings.status, [...PUBLIC_FILING_STATUSES])];
  if (filter.search) {
    const q = `%${filter.search}%`;
    conds.push(
      or(ilike(transactions.descriptionRaw, q), ilike(companies.ticker, q), ilike(companies.name, q))!,
    );
  }
  if (filter.type) conds.push(eq(transactions.transactionType, filter.type));
  if (filter.dateFrom) conds.push(gte(transactions.transactionDate, filter.dateFrom));
  if (filter.dateTo) conds.push(lte(transactions.transactionDate, filter.dateTo));
  if (filter.bandMin) conds.push(gte(transactions.amountBand, filter.bandMin));
  const where = and(...conds);

  const sortCol = SORT_COLUMNS[filter.sortBy ?? "date"];
  const orderBy = (filter.order ?? "desc") === "asc" ? asc(sortCol) : desc(sortCol);

  const rows = await db
    .select({
      id: transactions.id,
      rowNumber: transactions.rowNumber,
      descriptionRaw: transactions.descriptionRaw,
      transactionType: transactions.transactionType,
      transactionDate: transactions.transactionDate,
      notificationLate: transactions.notificationLate,
      amountBand: transactions.amountBand,
      amountMin: transactions.amountMin,
      amountMax: transactions.amountMax,
      ticker: companies.ticker,
      companyName: companies.name,
      sector: companies.sector,
      filingId: transactions.filingId,
      filingDate: filings.filingDate,
      sourceUrl: filings.sourceUrl,
    })
    .from(transactions)
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .leftJoin(companies, eq(transactions.companyId, companies.id))
    .where(where)
    .orderBy(orderBy)
    .limit(limit)
    .offset((page - 1) * limit);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(transactions)
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .leftJoin(companies, eq(transactions.companyId, companies.id))
    .where(where);

  return { rows: rows as TransactionRow[], total };
}

/** A single transaction with its filing context. */
export async function getTransaction(id: string): Promise<TransactionRow | null> {
  const rows = await db
    .select({
      id: transactions.id,
      rowNumber: transactions.rowNumber,
      descriptionRaw: transactions.descriptionRaw,
      transactionType: transactions.transactionType,
      transactionDate: transactions.transactionDate,
      notificationLate: transactions.notificationLate,
      amountBand: transactions.amountBand,
      amountMin: transactions.amountMin,
      amountMax: transactions.amountMax,
      ticker: companies.ticker,
      companyName: companies.name,
      sector: companies.sector,
      filingId: transactions.filingId,
      filingDate: filings.filingDate,
      sourceUrl: filings.sourceUrl,
    })
    .from(transactions)
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .leftJoin(companies, eq(transactions.companyId, companies.id))
    .where(eq(transactions.id, id))
    .limit(1);
  return (rows[0] as TransactionRow) ?? null;
}

/** All publicly-visible filings, newest first. */
export async function listFilings() {
  return db
    .select()
    .from(filings)
    .where(inArray(filings.status, [...PUBLIC_FILING_STATUSES]))
    .orderBy(desc(filings.filingDate));
}

/** One filing plus its transactions. */
export async function getFiling(id: string) {
  const [filing] = await db.select().from(filings).where(eq(filings.id, id)).limit(1);
  if (!filing) return null;
  const txns = await db
    .select()
    .from(transactions)
    .where(eq(transactions.filingId, id))
    .orderBy(asc(transactions.rowNumber));
  return { filing, transactions: txns };
}

/** Transaction-type counts for the publicly-visible dataset. */
export async function getTypeBreakdown(): Promise<{ type: string; n: number }[]> {
  const rows = await db
    .select({ type: transactions.transactionType, n: count() })
    .from(transactions)
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .where(inArray(filings.status, [...PUBLIC_FILING_STATUSES]))
    .groupBy(transactions.transactionType)
    .orderBy(desc(count()));
  return rows.map((r) => ({ type: r.type, n: Number(r.n) }));
}

export interface SiteStats {
  totalTransactions: number;
  totalFilings: number;
  earliestDate: string | null;
  latestDate: string | null;
  lastFilingDate: string | null;
  estimatedValueMin: number;
  estimatedValueMax: number;
}

/** Headline statistics for the dashboard. */
export async function getStats(): Promise<SiteStats> {
  const [agg] = await db
    .select({
      txns: count(transactions.id),
      minDate: sql<string | null>`min(${transactions.transactionDate})`,
      maxDate: sql<string | null>`max(${transactions.transactionDate})`,
      sumMin: sql<number>`coalesce(sum(${transactions.amountMin}), 0)`,
      sumMax: sql<number>`coalesce(sum(coalesce(${transactions.amountMax}, ${transactions.amountMin})), 0)`,
    })
    .from(transactions)
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .where(inArray(filings.status, [...PUBLIC_FILING_STATUSES]));

  const [filingAgg] = await db
    .select({
      n: count(filings.id),
      last: sql<string | null>`max(${filings.filingDate})`,
    })
    .from(filings)
    .where(inArray(filings.status, [...PUBLIC_FILING_STATUSES]));

  return {
    totalTransactions: Number(agg?.txns ?? 0),
    totalFilings: Number(filingAgg?.n ?? 0),
    earliestDate: agg?.minDate ?? null,
    latestDate: agg?.maxDate ?? null,
    lastFilingDate: filingAgg?.last ?? null,
    estimatedValueMin: Number(agg?.sumMin ?? 0),
    estimatedValueMax: Number(agg?.sumMax ?? 0),
  };
}
