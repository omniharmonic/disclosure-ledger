import Link from "next/link";
import type { Metadata } from "next";
import { listTransactions } from "@/lib/queries";
import { TradeFilters } from "@/components/TradeFilters";
import { formatDate, formatAmount, typeColor } from "@/lib/format";

export const metadata: Metadata = { title: "Trades" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function str(sp: SP, k: string): string | undefined {
  const v = sp[k];
  return typeof v === "string" ? v : undefined;
}

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const page = Number(str(sp, "page") ?? "1") || 1;
  const { rows, total } = await listTransactions({
    search: str(sp, "search"),
    type: str(sp, "type"),
    dateFrom: str(sp, "dateFrom"),
    dateTo: str(sp, "dateTo"),
    bandMin: str(sp, "bandMin") ? Number(str(sp, "bandMin")) : undefined,
    page,
    limit: 50,
  });
  const totalPages = Math.max(1, Math.ceil(total / 50));

  const buildPageUrl = (p: number) => {
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") query[k] = v;
    query.page = String(p);
    return { pathname: "/trades" as const, query };
  };

  return (
    <div className="space-y-6">
      <header className="rise">
        <div className="kicker">Transaction register</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Disclosed trades
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          {total.toLocaleString()} transaction{total === 1 ? "" : "s"} from publicly-released
          OGE Form 278-T filings. Amounts are statutory ranges, not exact figures.
        </p>
      </header>

      <TradeFilters />

      {rows.length === 0 ? (
        <p className="rounded border border-[var(--color-rule)] bg-white p-8 text-center text-sm text-[var(--color-muted)]">
          No transactions match these filters yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-[var(--color-rule)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)] bg-white text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Security</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Amount range</th>
                <th className="px-3 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-[var(--color-rule)] last:border-0 hover:bg-white">
                  <td className="px-3 py-2 tabular text-[var(--color-muted)]">{t.rowNumber}</td>
                  <td className="px-3 py-2 tabular whitespace-nowrap">{formatDate(t.transactionDate)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={`/trades/${t.id}`} className="hover:underline">
                      {t.ticker ? <span className="font-mono font-semibold">{t.ticker}</span> : null}{" "}
                      <span className={t.ticker ? "text-[var(--color-muted)]" : ""}>
                        {t.descriptionRaw.length > 70
                          ? t.descriptionRaw.slice(0, 70) + "…"
                          : t.descriptionRaw}
                      </span>
                    </Link>
                  </td>
                  <td className={`px-3 py-2 font-medium ${typeColor(t.transactionType)}`}>
                    {t.transactionType}
                  </td>
                  <td className="px-3 py-2 tabular whitespace-nowrap">{formatAmount(t.amountBand)}</td>
                  <td className="px-3 py-2">
                    <a
                      href={t.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                    >
                      PDF ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--color-muted)]">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={buildPageUrl(page - 1)} className="rounded border border-[var(--color-rule)] px-3 py-1.5">
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link href={buildPageUrl(page + 1)} className="rounded border border-[var(--color-rule)] px-3 py-1.5">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
