import Link from "next/link";
import { getStats, getTypeBreakdown, listTransactions } from "@/lib/queries";
import { formatDate, formatDollars, formatAmount, typeColor } from "@/lib/format";

export const dynamic = "force-dynamic";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-[var(--color-rule)] bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[var(--color-muted)]">{sub}</div>}
    </div>
  );
}

export default async function HomePage() {
  const [stats, types, recent] = await Promise.all([
    getStats(),
    getTypeBreakdown(),
    listTransactions({ limit: 12, sortBy: "date", order: "desc" }),
  ]);
  const hasData = stats.totalTransactions > 0;

  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">
          A public record of presidential trading — and what surrounds it.
        </h1>
        <p className="mt-3 text-[var(--color-muted)]">
          This platform converts the President&rsquo;s securities-disclosure filings into
          rigorous structured data and surfaces transparently-scored timing correlations
          with his public statements and official actions. Every figure links to its
          primary source.
        </p>
      </section>

      {hasData ? (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Transactions"
              value={stats.totalTransactions.toLocaleString()}
              sub="from released filings"
            />
            <StatCard
              label="Estimated value"
              value={`${formatDollars(stats.estimatedValueMin)}–${formatDollars(stats.estimatedValueMax)}`}
              sub="sum of statutory bands"
            />
            <StatCard
              label="Date coverage"
              value={
                stats.earliestDate
                  ? `${new Date(stats.earliestDate).getFullYear()}–${new Date(
                      stats.latestDate!,
                    ).getFullYear()}`
                  : "—"
              }
              sub={
                stats.earliestDate
                  ? `${formatDate(stats.earliestDate)} – ${formatDate(stats.latestDate)}`
                  : undefined
              }
            />
            <StatCard
              label="Filings published"
              value={String(stats.totalFilings)}
              sub={stats.lastFilingDate ? `last ${formatDate(stats.lastFilingDate)}` : undefined}
            />
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Transaction mix
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {types.map((t) => (
                <div
                  key={t.type}
                  className="rounded border border-[var(--color-rule)] bg-white px-3 py-1.5 text-sm"
                >
                  <span className={`font-medium ${typeColor(t.type)}`}>{t.type}</span>{" "}
                  <span className="tabular text-[var(--color-muted)]">
                    {t.n.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                Recent trades
              </h2>
              <Link href="/trades" className="text-sm text-[var(--color-accent)] hover:underline">
                All trades →
              </Link>
            </div>
            <div className="mt-3 overflow-x-auto rounded border border-[var(--color-rule)]">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {recent.rows.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-[var(--color-rule)] last:border-0 hover:bg-white"
                    >
                      <td className="px-3 py-2 tabular whitespace-nowrap text-[var(--color-muted)]">
                        {formatDate(t.transactionDate)}
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/trades/${t.id}`} className="hover:underline">
                          {t.descriptionRaw.length > 60
                            ? t.descriptionRaw.slice(0, 60) + "…"
                            : t.descriptionRaw}
                        </Link>
                      </td>
                      <td className={`px-3 py-2 font-medium ${typeColor(t.transactionType)}`}>
                        {t.transactionType}
                      </td>
                      <td className="px-3 py-2 tabular whitespace-nowrap">
                        {formatAmount(t.amountBand)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <p className="rounded border border-dashed border-[var(--color-rule)] p-8 text-sm text-[var(--color-muted)]">
          No published transactions yet — the ingestion pipeline is still running or all
          filings are under review.
        </p>
      )}

      <nav className="flex flex-wrap gap-3 text-sm">
        <Link href="/trades" className="rounded border border-[var(--color-rule)] px-4 py-2 hover:bg-white">
          Browse all trades →
        </Link>
        <Link href="/methodology" className="rounded border border-[var(--color-rule)] px-4 py-2 hover:bg-white">
          Methodology →
        </Link>
      </nav>
    </div>
  );
}
