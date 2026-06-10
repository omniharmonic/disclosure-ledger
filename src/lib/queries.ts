/**
 * Shared read queries. Used by both server components and the public API so
 * the website and the API never diverge.
 *
 * Only filings at status `parsed` or `published` (and their transactions) are
 * exposed publicly; `review` and `pending` filings are withheld until a human
 * confirms them (PRD FR-O3, NFR "Accuracy").
 */
import { db } from "@/db";
import {
  filings,
  transactions,
  companies,
  statements,
  statementMentions,
  actions,
  correlations,
  graphEdges,
  persons,
  priceCache,
} from "@/db/schema";
import { and, or, eq, gte, lte, ilike, desc, asc, sql, inArray, count } from "drizzle-orm";

export const PUBLIC_FILING_STATUSES = ["parsed", "published"] as const;

/**
 * Guard for user-supplied ids. Postgres throws (→ HTTP 500) on a malformed
 * uuid cast; validating the shape first turns garbage input into a clean 404.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

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

/**
 * A single transaction with its filing context. Only rows from publicly
 * released filings are returned — a `review`/`pending`/`superseded` filing's
 * rows must not be readable even by direct URL (PRD NFR "Accuracy", FR-O3).
 */
export async function getTransaction(id: string): Promise<TransactionRow | null> {
  if (!isUuid(id)) return null;
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
    .where(
      and(eq(transactions.id, id), inArray(filings.status, [...PUBLIC_FILING_STATUSES])),
    )
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

/** One publicly-released filing plus its transactions. */
export async function getFiling(id: string) {
  if (!isUuid(id)) return null;
  const [filing] = await db
    .select()
    .from(filings)
    .where(and(eq(filings.id, id), inArray(filings.status, [...PUBLIC_FILING_STATUSES])))
    .limit(1);
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

export interface CompanyListItem {
  id: string;
  name: string;
  ticker: string | null;
  sector: string | null;
  industry: string | null;
  tradeCount: number;
  correlationCount: number;
  topSignal: number | null;
}

/** Companies in the dataset, ranked by correlation activity then trade volume. */
export async function listCompanies(): Promise<CompanyListItem[]> {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      ticker: companies.ticker,
      sector: companies.sector,
      industry: companies.industry,
      tradeCount: sql<number>`count(distinct ${transactions.id})`,
      correlationCount: sql<number>`count(distinct ${correlations.id})`,
      topSignal: sql<number | null>`max(${correlations.signalScore})`,
    })
    .from(companies)
    .innerJoin(transactions, eq(transactions.companyId, companies.id))
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .leftJoin(
      correlations,
      and(
        eq(correlations.transactionId, transactions.id),
        sql`${correlations.verifiedGenuine} is not false`,
      ),
    )
    .where(inArray(filings.status, [...PUBLIC_FILING_STATUSES]))
    .groupBy(companies.id)
    .orderBy(
      desc(sql`count(distinct ${correlations.id})`),
      desc(sql`count(distinct ${transactions.id})`),
    );
  return rows.map((r) => ({
    ...r,
    tradeCount: Number(r.tradeCount),
    correlationCount: Number(r.correlationCount),
    topSignal: r.topSignal != null ? Number(r.topSignal) : null,
  }));
}

/** A company profile with its trades and every correlation across them. */
export async function getCompany(ticker: string) {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.ticker, ticker))
    .limit(1);
  if (!company) return null;

  const txns = await db
    .select({
      id: transactions.id,
      rowNumber: transactions.rowNumber,
      descriptionRaw: transactions.descriptionRaw,
      transactionType: transactions.transactionType,
      transactionDate: transactions.transactionDate,
      amountBand: transactions.amountBand,
      amountMin: transactions.amountMin,
      amountMax: transactions.amountMax,
      priceAtTxn: transactions.priceAtTxn,
      priceCurrent: transactions.priceCurrent,
      gainLossPct: transactions.gainLossPct,
      filingId: transactions.filingId,
      filingDate: filings.filingDate,
      sourceUrl: filings.sourceUrl,
    })
    .from(transactions)
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .where(
      and(
        eq(transactions.companyId, company.id),
        inArray(filings.status, [...PUBLIC_FILING_STATUSES]),
      ),
    )
    .orderBy(desc(transactions.transactionDate));

  const prices = await db
    .select({ date: priceCache.priceDate, close: priceCache.closePrice })
    .from(priceCache)
    .where(eq(priceCache.ticker, company.ticker ?? "—"))
    .orderBy(asc(priceCache.priceDate));

  const corr = await db
    .select({
      id: correlations.id,
      transactionId: correlations.transactionId,
      eventKind: correlations.eventKind,
      daysGap: correlations.daysGap,
      signalScore: correlations.signalScore,
      components: correlations.components,
      transactionDate: transactions.transactionDate,
      transactionType: transactions.transactionType,
      statementText: statements.fullText,
      statementDate: statements.spokenAt,
      statementUrl: statements.sourceUrl,
      actionTitle: actions.title,
      actionDate: actions.occurredOn,
      actionUrl: actions.sourceUrl,
    })
    .from(correlations)
    .innerJoin(transactions, eq(correlations.transactionId, transactions.id))
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .leftJoin(statements, eq(correlations.statementId, statements.id))
    .leftJoin(actions, eq(correlations.actionId, actions.id))
    .where(
      and(
        eq(transactions.companyId, company.id),
        inArray(filings.status, [...PUBLIC_FILING_STATUSES]),
        sql`${correlations.verifiedGenuine} is not false`,
      ),
    )
    .orderBy(desc(correlations.signalScore));

  return {
    company,
    transactions: txns,
    prices,
    correlations: corr.map((r) => ({
      id: r.id,
      transactionId: r.transactionId,
      eventKind: r.eventKind as "statement" | "action",
      daysGap: r.daysGap,
      signalScore: r.signalScore,
      components: (r.components ?? {}) as Record<string, number>,
      transactionDate: r.transactionDate,
      transactionType: r.transactionType,
      eventDate: (r.eventKind === "statement" ? r.statementDate : r.actionDate) ?? "",
      eventTitle:
        r.eventKind === "statement"
          ? (r.statementText ?? "").slice(0, 280)
          : (r.actionTitle ?? ""),
      eventUrl: (r.eventKind === "statement" ? r.statementUrl : r.actionUrl) ?? "",
    })),
  };
}

export interface CorrelationView {
  id: string;
  eventKind: "statement" | "action";
  daysGap: number;
  signalScore: number;
  components: Record<string, number>;
  eventDate: string;
  eventTitle: string;
  eventUrl: string;
}

/** Correlations for one transaction in a public filing, highest signal first. */
export async function getCorrelations(transactionId: string): Promise<CorrelationView[]> {
  if (!isUuid(transactionId)) return [];
  const rows = await db
    .select({
      id: correlations.id,
      eventKind: correlations.eventKind,
      daysGap: correlations.daysGap,
      signalScore: correlations.signalScore,
      components: correlations.components,
      statementText: statements.fullText,
      statementDate: statements.spokenAt,
      statementUrl: statements.sourceUrl,
      actionTitle: actions.title,
      actionDate: actions.occurredOn,
      actionUrl: actions.sourceUrl,
    })
    .from(correlations)
    .innerJoin(transactions, eq(correlations.transactionId, transactions.id))
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .leftJoin(statements, eq(correlations.statementId, statements.id))
    .leftJoin(actions, eq(correlations.actionId, actions.id))
    .where(
      and(
        eq(correlations.transactionId, transactionId),
        inArray(filings.status, [...PUBLIC_FILING_STATUSES]),
        // hide correlations the reasoning stage flagged as string coincidences
        sql`${correlations.verifiedGenuine} is not false`,
      ),
    )
    .orderBy(desc(correlations.signalScore));

  return rows.map((r) => ({
    id: r.id,
    eventKind: r.eventKind as "statement" | "action",
    daysGap: r.daysGap,
    signalScore: r.signalScore,
    components: (r.components ?? {}) as Record<string, number>,
    eventDate: (r.eventKind === "statement" ? r.statementDate : r.actionDate) ?? "",
    eventTitle:
      r.eventKind === "statement"
        ? (r.statementText ?? "").slice(0, 240)
        : (r.actionTitle ?? ""),
    eventUrl: (r.eventKind === "statement" ? r.statementUrl : r.actionUrl) ?? "",
  }));
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  val: number;
  /** Fuller text shown when the node is inspected. */
  detail?: string;
  /** A short secondary line — date, sector, source. */
  sub?: string;
}
export interface GraphLink {
  source: string;
  target: string;
  rel: string;
  weight: number;
}

/** The full knowledge graph as nodes + links for force-directed rendering. */
export async function getGraph(): Promise<{ nodes: GraphNode[]; links: GraphLink[] }> {
  const edges = await db.select().from(graphEdges);
  const ids: Record<string, Set<string>> = {};
  for (const e of edges) {
    (ids[e.srcType] ??= new Set()).add(e.srcId);
    (ids[e.dstType] ??= new Set()).add(e.dstId);
  }
  const labels = new Map<string, string>();
  const details = new Map<string, string>();
  const subs = new Map<string, string>();
  const key = (t: string, id: string) => `${t}:${id}`;

  if (ids.person?.size) {
    for (const p of await db.select().from(persons)) {
      labels.set(key("person", p.id), p.fullName);
      subs.set(key("person", p.id), p.role);
    }
  }
  if (ids.company?.size) {
    for (const c of await db.select().from(companies)) {
      labels.set(key("company", c.id), c.ticker ?? c.name);
      details.set(key("company", c.id), c.oneLiner ?? c.name);
      subs.set(key("company", c.id), [c.sector, c.industry].filter(Boolean).join(" · "));
    }
  }
  if (ids.filing?.size) {
    for (const f of await db.select().from(filings)) {
      labels.set(key("filing", f.id), `${f.formType} ${f.filingDate}`);
      subs.set(key("filing", f.id), `filed ${f.filingDate}`);
    }
  }
  if (ids.statement?.size) {
    for (const s of await db.select().from(statements)) {
      labels.set(key("statement", s.id), s.fullText.slice(0, 44));
      details.set(key("statement", s.id), s.fullText.slice(0, 360));
      subs.set(key("statement", s.id), `${s.channel ?? "statement"} · ${s.spokenAt}`);
    }
  }
  if (ids.action?.size) {
    for (const a of await db.select().from(actions)) {
      labels.set(key("action", a.id), a.title.slice(0, 52));
      details.set(key("action", a.id), a.title);
      subs.set(key("action", a.id), `${a.actionType.replace(/_/g, " ")} · ${a.occurredOn}`);
    }
  }

  const nodeMap = new Map<string, GraphNode>();
  const ensure = (type: string, id: string) => {
    const k = key(type, id);
    if (!nodeMap.has(k))
      nodeMap.set(k, {
        id: k,
        type,
        label: labels.get(k) ?? type,
        val: 1,
        detail: details.get(k),
        sub: subs.get(k),
      });
    else nodeMap.get(k)!.val += 1;
  };
  const links: GraphLink[] = edges.map((e) => {
    ensure(e.srcType, e.srcId);
    ensure(e.dstType, e.dstId);
    return {
      source: key(e.srcType, e.srcId),
      target: key(e.dstType, e.dstId),
      rel: e.relType,
      weight: e.weight ?? 1,
    };
  });
  return { nodes: [...nodeMap.values()], links };
}

export interface TimelineEvent {
  id: string;
  kind: "trade" | "statement" | "action";
  date: string;
  label: string;
  detail: string;
  href: string;
  internal: boolean;
  /** Company tickers tied to this event (via the trade or its correlations). */
  tags: string[];
  /** What this event is correlated to, highest signal first. */
  related: { label: string; signal: number; href: string }[];
}

/**
 * Dated events for the timeline. Trades are restricted to those in a resolved
 * company (the analytically interesting ones); statements and actions are
 * those that mention/affect a company, so the three lanes are comparable.
 */
export async function getTimelineEvents(limit = 600): Promise<TimelineEvent[]> {
  const trades = await db
    .select({
      id: transactions.id,
      date: transactions.transactionDate,
      desc: transactions.descriptionRaw,
      type: transactions.transactionType,
      ticker: companies.ticker,
    })
    .from(transactions)
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .innerJoin(companies, eq(transactions.companyId, companies.id))
    .where(inArray(filings.status, [...PUBLIC_FILING_STATUSES]))
    .orderBy(desc(transactions.transactionDate))
    .limit(limit);

  const stmts = await db
    .selectDistinctOn([statements.id], {
      id: statements.id,
      date: statements.spokenAt,
      text: statements.fullText,
      url: statements.sourceUrl,
    })
    .from(statementMentions)
    .innerJoin(statements, eq(statementMentions.statementId, statements.id))
    .orderBy(statements.id, desc(statements.spokenAt))
    .limit(limit);

  const acts = await db
    .select({ id: actions.id, date: actions.occurredOn, title: actions.title, url: actions.sourceUrl })
    .from(actions)
    .orderBy(desc(actions.occurredOn))
    .limit(limit);

  // Correlation links, so each event card can show what it connects to.
  const corrRows = await db
    .select({
      transactionId: correlations.transactionId,
      statementId: correlations.statementId,
      actionId: correlations.actionId,
      eventKind: correlations.eventKind,
      signal: correlations.signalScore,
      ticker: companies.ticker,
      txnId: transactions.id,
      txnType: transactions.transactionType,
      statementText: statements.fullText,
      actionTitle: actions.title,
    })
    .from(correlations)
    .innerJoin(transactions, eq(correlations.transactionId, transactions.id))
    .innerJoin(filings, eq(transactions.filingId, filings.id))
    .leftJoin(companies, eq(transactions.companyId, companies.id))
    .leftJoin(statements, eq(correlations.statementId, statements.id))
    .leftJoin(actions, eq(correlations.actionId, actions.id))
    .where(
      and(
        inArray(filings.status, [...PUBLIC_FILING_STATUSES]),
        sql`${correlations.verifiedGenuine} is not false`,
      ),
    );

  type Rel = { label: string; signal: number; href: string };
  const byTrade = new Map<string, Rel[]>();
  const byEvent = new Map<string, Rel[]>();
  const tagsByTrade = new Map<string, Set<string>>();
  const tagsByEvent = new Map<string, Set<string>>();

  for (const r of corrRows) {
    const eventId = r.eventKind === "statement" ? r.statementId : r.actionId;
    if (!eventId) continue;
    const eventLabel =
      r.eventKind === "statement"
        ? `“${(r.statementText ?? "").slice(0, 60)}…”`
        : (r.actionTitle ?? "official action");
    // trade -> its events
    (byTrade.get(r.transactionId) ?? byTrade.set(r.transactionId, []).get(r.transactionId)!).push({
      label: eventLabel,
      signal: r.signal,
      href: `/trades/${r.transactionId}`,
    });
    // event -> its trades
    (byEvent.get(eventId) ?? byEvent.set(eventId, []).get(eventId)!).push({
      label: `${r.ticker ?? "?"} ${r.txnType}`,
      signal: r.signal,
      href: `/trades/${r.txnId}`,
    });
    if (r.ticker) {
      (tagsByTrade.get(r.transactionId) ?? tagsByTrade.set(r.transactionId, new Set()).get(r.transactionId)!).add(r.ticker);
      (tagsByEvent.get(eventId) ?? tagsByEvent.set(eventId, new Set()).get(eventId)!).add(r.ticker);
    }
  }

  const topRel = (rs: Rel[] | undefined): Rel[] =>
    (rs ?? []).sort((a, b) => b.signal - a.signal).slice(0, 8);

  return [
    ...trades.map((t) => ({
      id: t.id,
      kind: "trade" as const,
      date: t.date,
      label: t.ticker ? `${t.type} ${t.ticker}` : t.type,
      detail: t.desc,
      href: `/trades/${t.id}`,
      internal: true,
      tags: t.ticker ? [t.ticker] : [],
      related: topRel(byTrade.get(t.id)),
    })),
    ...stmts.map((s) => ({
      id: s.id,
      kind: "statement" as const,
      date: s.date,
      label: s.text.slice(0, 48),
      detail: s.text.slice(0, 400),
      href: s.url,
      internal: false,
      tags: [...(tagsByEvent.get(s.id) ?? [])],
      related: topRel(byEvent.get(s.id)),
    })),
    ...acts.map((a) => ({
      id: a.id,
      kind: "action" as const,
      date: a.date,
      label: a.title.slice(0, 48),
      detail: a.title,
      href: a.url,
      internal: false,
      tags: [...(tagsByEvent.get(a.id) ?? [])],
      related: topRel(byEvent.get(a.id)),
    })),
  ];
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
