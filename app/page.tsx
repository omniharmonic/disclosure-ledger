import Link from "next/link";
import {
  getStats,
  getTypeBreakdown,
  listTransactions,
  listCompanies,
  getTopHoldings,
  getSectorBreakdown,
  getGainLossLeaders,
} from "@/lib/queries";
import { formatDate, formatDollars, formatAmount, typeColor } from "@/lib/format";

/** ISR — data changes at most once per pipeline run; revalidated on a timer
 *  and on demand via /api/revalidate after each run (ARCHITECTURE §7.2). */
export const revalidate = 300;

function StatCard({ label, value, sub, i }: { label: string; value: string; sub?: string; i: number }) {
  return (
    <div
      className="rise rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)] p-4"
      style={{ animationDelay: `${i * 70}ms` }}
    >
      <div className="kicker">{label}</div>
      <div className="mt-1.5 font-display text-2xl font-semibold tabular leading-none tracking-tight sm:text-3xl">
        {value}
      </div>
      {sub && <div className="mt-1 text-[0.7rem] text-[var(--color-muted)]">{sub}</div>}
    </div>
  );
}

export default async function HomePage() {
  const [stats, types, recent, companies, holdings, sectors, gainLoss] = await Promise.all([
    getStats(),
    getTypeBreakdown(),
    listTransactions({ limit: 10, sortBy: "date", order: "desc" }),
    listCompanies(),
    getTopHoldings(5),
    getSectorBreakdown(),
    getGainLossLeaders(3),
  ]);
  const hasData = stats.totalTransactions > 0;
  const topCompanies = companies.filter((c) => c.correlationCount > 0).slice(0, 5);
  const sectorMax = Math.max(1, ...sectors.map((s) => s.sumMax));
  const leaders = [...gainLoss.gainers, ...gainLoss.losers];

  return (
    <div className="space-y-14">
      <section className="rise max-w-4xl">
        <div className="kicker">Independent watchdog oversight</div>
        <h1 className="mt-3 font-display text-3xl font-bold leading-[1.15] tracking-tight sm:text-[2.6rem]">
          A public record of presidential trading
          <span className="text-[var(--color-accent)]"> — and everything around it.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--color-ink-soft)]">
          This platform turns the President&rsquo;s securities-disclosure filings into rigorous
          structured data, then sets each trade beside his contemporaneous public statements and
          official government actions. Every figure links to a primary source.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/trades" className="rounded border border-[var(--color-ink)] bg-[var(--color-ink)] px-4 py-2 font-medium text-[var(--color-paper)] hover:bg-[var(--color-accent)] hover:border-[var(--color-accent)]">
            Browse all trades →
          </Link>
          <Link href="/graph" className="rounded border border-[var(--color-rule)] px-4 py-2 hover:border-[var(--color-ink)]">
            Explore the graph →
          </Link>
        </div>
      </section>

      {hasData ? (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard i={0} label="Transactions" value={stats.totalTransactions.toLocaleString()} sub="from released filings" />
            <StatCard i={1} label="Estimated value" value={`${formatDollars(stats.estimatedValueMin)}–${formatDollars(stats.estimatedValueMax)}`} sub="sum of statutory bands" />
            <StatCard i={2} label="Date coverage" value={stats.earliestDate ? `${stats.earliestDate.slice(0, 4)}–${stats.latestDate!.slice(0, 4)}` : "—"} sub={stats.earliestDate ? `${formatDate(stats.earliestDate)} – ${formatDate(stats.latestDate)}` : undefined} />
            <StatCard i={3} label="Filings" value={String(stats.totalFilings)} sub={stats.lastFilingDate ? `last ${formatDate(stats.lastFilingDate)}` : undefined} />
          </section>

          {topCompanies.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between">
                <div className="kicker">Most correlated companies</div>
                <Link href="/companies" className="text-xs text-[var(--color-accent)] hover:underline">
                  All companies →
                </Link>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {topCompanies.map((c) => (
                  <Link
                    key={c.id}
                    href={`/companies/${encodeURIComponent(c.ticker ?? c.name)}`}
                    className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)] p-3 hover:border-[var(--color-accent)]"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono font-bold">{c.ticker}</span>
                      <span className="font-display text-xl font-semibold text-[var(--color-accent)]">
                        {c.correlationCount}
                      </span>
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-[0.7rem] text-[var(--color-muted)]">
                      {c.name}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-8 lg:grid-cols-3">
            <div>
              <div className="kicker">Top disclosed positions</div>
              <p className="mt-1 text-[0.7rem] text-[var(--color-muted)]">
                Summed statutory ranges — bounds, never exact figures.
              </p>
              <ul className="mt-3 space-y-2">
                {holdings.map((h) => (
                  <li key={h.ticker ?? h.name}>
                    <Link
                      href={`/companies/${encodeURIComponent(h.ticker ?? h.name)}`}
                      className="flex items-baseline justify-between gap-3 rounded border border-[var(--color-rule)] bg-[var(--color-card)] px-3 py-2 hover:border-[var(--color-accent)]"
                    >
                      <span>
                        <span className="font-mono font-bold">{h.ticker ?? "—"}</span>{" "}
                        <span className="text-xs text-[var(--color-muted)]">
                          {h.tradeCount} trade{h.tradeCount === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="tabular text-sm whitespace-nowrap">
                        {formatDollars(h.sumMin)}–{formatDollars(h.sumMax)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="kicker">Sector concentration</div>
              <p className="mt-1 text-[0.7rem] text-[var(--color-muted)]">
                Upper-bound of summed ranges per sector.
              </p>
              <div className="mt-3 space-y-2">
                {sectors.slice(0, 7).map((s) => (
                  <div key={s.sector}>
                    <div className="flex justify-between text-xs">
                      <span className="truncate pr-2">{s.sector}</span>
                      <span className="tabular whitespace-nowrap text-[var(--color-muted)]">
                        {formatDollars(s.sumMin)}–{formatDollars(s.sumMax)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-[var(--color-rule-soft)]">
                      <div
                        className="h-1.5 rounded-full bg-[var(--color-accent)]/70"
                        style={{ width: `${Math.max(2, (s.sumMax / sectorMax) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="kicker">Price moves since trade</div>
              <p className="mt-1 text-[0.7rem] text-[var(--color-muted)]">
                EOD change since transaction date — indicative, not a realized return.
              </p>
              {leaders.length === 0 ? (
                <p className="mt-3 rounded border border-dashed border-[var(--color-rule)] p-4 text-xs text-[var(--color-muted)]">
                  Price enrichment pending — appears once the price pipeline has run.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {leaders.map((g) => (
                    <li key={g.id}>
                      <Link
                        href={`/trades/${g.id}`}
                        className="flex items-baseline justify-between gap-3 rounded border border-[var(--color-rule)] bg-[var(--color-card)] px-3 py-2 hover:border-[var(--color-accent)]"
                      >
                        <span>
                          <span className="font-mono font-bold">{g.ticker}</span>{" "}
                          <span className={`text-xs ${typeColor(g.transactionType)}`}>
                            {g.transactionType}
                          </span>{" "}
                          <span className="text-xs text-[var(--color-muted)]">
                            {formatDate(g.transactionDate)}
                          </span>
                        </span>
                        <span
                          className="tabular text-sm font-semibold"
                          style={{ color: g.gainLossPct >= 0 ? "var(--color-buy)" : "var(--color-sell)" }}
                        >
                          {g.gainLossPct >= 0 ? "+" : ""}
                          {g.gainLossPct.toFixed(1)}%
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="grid gap-8 lg:grid-cols-[2fr_1fr]">
            <div>
              <div className="flex items-baseline justify-between">
                <div className="kicker">Recent trades</div>
                <Link href="/trades" className="text-xs text-[var(--color-accent)] hover:underline">
                  All trades →
                </Link>
              </div>
              <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--color-rule)]">
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {recent.rows.map((t) => (
                      <tr key={t.id} className="border-b border-[var(--color-rule-soft)] last:border-0 hover:bg-[var(--color-card)]">
                        <td className="px-3 py-2 tabular whitespace-nowrap text-[var(--color-muted)]">
                          {formatDate(t.transactionDate)}
                        </td>
                        <td className="px-3 py-2">
                          <Link href={`/trades/${t.id}`} className="hover:underline">
                            {t.descriptionRaw.slice(0, 52)}
                            {t.descriptionRaw.length > 52 ? "…" : ""}
                          </Link>
                        </td>
                        <td className={`px-3 py-2 font-medium ${typeColor(t.transactionType)}`}>
                          {t.transactionType}
                        </td>
                        <td className="px-3 py-2 tabular whitespace-nowrap text-right">
                          {formatAmount(t.amountBand)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <div className="kicker">Transaction mix</div>
              <div className="mt-3 space-y-2">
                {types.map((t) => {
                  const pct = (t.n / stats.totalTransactions) * 100;
                  return (
                    <div key={t.type}>
                      <div className="flex justify-between text-xs">
                        <span className={`font-medium ${typeColor(t.type)}`}>{t.type}</span>
                        <span className="tabular text-[var(--color-muted)]">
                          {t.n.toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-[var(--color-rule-soft)]">
                        <div className="h-1.5 rounded-full bg-[var(--color-ink-soft)]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-[var(--color-rule)] p-8 text-sm text-[var(--color-muted)]">
          No published transactions yet — the ingestion pipeline is still running.
        </p>
      )}
    </div>
  );
}
