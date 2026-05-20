import Link from "next/link";
import { getStats, getTypeBreakdown, listTransactions, listCompanies } from "@/lib/queries";
import { formatDate, formatDollars, formatAmount, typeColor } from "@/lib/format";

export const dynamic = "force-dynamic";

function StatCard({ label, value, sub, i }: { label: string; value: string; sub?: string; i: number }) {
  return (
    <div
      className="rise rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)] p-4"
      style={{ animationDelay: `${i * 70}ms` }}
    >
      <div className="kicker">{label}</div>
      <div className="mt-1.5 font-display text-3xl font-semibold tabular leading-none tracking-tight">
        {value}
      </div>
      {sub && <div className="mt-1 text-[0.7rem] text-[var(--color-muted)]">{sub}</div>}
    </div>
  );
}

export default async function HomePage() {
  const [stats, types, recent, companies] = await Promise.all([
    getStats(),
    getTypeBreakdown(),
    listTransactions({ limit: 10, sortBy: "date", order: "desc" }),
    listCompanies(),
  ]);
  const hasData = stats.totalTransactions > 0;
  const topCompanies = companies.filter((c) => c.correlationCount > 0).slice(0, 5);

  return (
    <div className="space-y-14">
      <section className="rise max-w-4xl">
        <div className="kicker">Office of Government Ethics · Form 278-T</div>
        <h1 className="mt-2 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          A public record of presidential trading — and everything around it.
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
            <StatCard i={2} label="Date coverage" value={stats.earliestDate ? `${new Date(stats.earliestDate).getFullYear()}–${new Date(stats.latestDate!).getFullYear()}` : "—"} sub={stats.earliestDate ? `${formatDate(stats.earliestDate)} – ${formatDate(stats.latestDate)}` : undefined} />
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

          <section className="grid gap-8 lg:grid-cols-[2fr_1fr]">
            <div>
              <div className="flex items-baseline justify-between">
                <div className="kicker">Recent trades</div>
                <Link href="/trades" className="text-xs text-[var(--color-accent)] hover:underline">
                  All trades →
                </Link>
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-[var(--color-rule)]">
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
