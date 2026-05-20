import Link from "next/link";
import { notFound } from "next/navigation";
import { getFiling } from "@/lib/queries";
import { formatDate, formatAmount, typeColor } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FilingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getFiling(id);
  if (!data) notFound();
  const { filing, transactions: txns } = data;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/filings" className="text-sm text-[var(--color-muted)] hover:underline">
          ← All filings
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {filing.formType} filed {formatDate(filing.filingDate)}
        </h1>
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-2 rounded border border-[var(--color-rule)] bg-white p-5 text-sm sm:grid-cols-3">
        {[
          ["Form type", filing.formType],
          ["Transactions", String(filing.transactionCount ?? "—")],
          ["Pages", String(filing.pageCount ?? "—")],
          ["Report period", filing.reportPeriodStart
            ? `${formatDate(filing.reportPeriodStart)} – ${formatDate(filing.reportPeriodEnd)}`
            : "—"],
          ["Parse method", filing.parseMethod ?? "—"],
          ["Parse confidence", filing.parseConfidence != null
            ? `${(filing.parseConfidence * 100).toFixed(0)}%`
            : "—"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <a
        href={filing.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block rounded border border-[var(--color-rule)] bg-white px-4 py-2 text-sm hover:bg-[var(--color-paper)]"
      >
        View original source PDF ↗
      </a>

      {txns.length > 0 && (
        <div className="overflow-x-auto rounded border border-[var(--color-rule)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)] bg-white text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Security</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Amount range</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} className="border-b border-[var(--color-rule)] last:border-0 hover:bg-white">
                  <td className="px-3 py-2 tabular text-[var(--color-muted)]">{t.rowNumber}</td>
                  <td className="px-3 py-2 tabular whitespace-nowrap">{formatDate(t.transactionDate)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/trades/${t.id}`} className="hover:underline">
                      {t.descriptionRaw.length > 70
                        ? t.descriptionRaw.slice(0, 70) + "…"
                        : t.descriptionRaw}
                    </Link>
                  </td>
                  <td className={`px-3 py-2 font-medium ${typeColor(t.transactionType)}`}>
                    {t.transactionType}
                  </td>
                  <td className="px-3 py-2 tabular whitespace-nowrap">{formatAmount(t.amountBand)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
