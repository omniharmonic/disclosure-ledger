import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCompany } from "@/lib/queries";
import { CorrelationCard } from "@/components/CorrelationCard";
import { formatDate, formatAmount, typeColor } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  return { title: decodeURIComponent(ticker) };
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const data = await getCompany(decodeURIComponent(ticker));
  if (!data) notFound();
  const { company, transactions: txns, correlations } = data;
  const topSignal = correlations[0]?.signalScore ?? 0;

  return (
    <div className="space-y-10">
      <header className="rise">
        <Link href="/companies" className="text-xs text-[var(--color-muted)] hover:underline">
          ← All companies
        </Link>
        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
          <span className="font-mono text-2xl font-bold text-[var(--color-accent)]">
            {company.ticker ?? "—"}
          </span>
          <h1 className="font-display text-4xl font-semibold tracking-tight">{company.name}</h1>
        </div>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          {[company.sector, company.industry].filter(Boolean).join(" · ") ||
            "Sector not yet resolved"}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Disclosed trades", String(txns.length)],
          ["Correlations", String(correlations.length)],
          ["Peak signal", topSignal ? `${topSignal.toFixed(0)}/100` : "—"],
          [
            "SEC filings",
            company.cik ? "EDGAR ↗" : "—",
            company.cik
              ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${company.cik}&type=&dateb=&owner=include&count=40`
              : undefined,
          ],
        ].map(([label, value, href]) => (
          <div key={label} className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)] p-3">
            <div className="kicker">{label}</div>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer"
                 className="font-display text-xl font-semibold text-[var(--color-accent)] hover:underline">
                {value}
              </a>
            ) : (
              <div className="font-display text-xl font-semibold tabular">{value}</div>
            )}
          </div>
        ))}
      </section>

      <section>
        <div className="kicker mb-3">
          Timing correlations · {correlations.length}
        </div>
        {correlations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-rule)] p-6 text-sm text-[var(--color-muted)]">
            No statements or official actions about {company.name} fell within the correlation
            window of any disclosed trade in it.
          </p>
        ) : (
          <div className="space-y-3">
            {correlations.map((c) => (
              <CorrelationCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="kicker mb-3">Disclosed trades · {txns.length}</div>
        <div className="overflow-x-auto rounded-lg border border-[var(--color-rule)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)] bg-[var(--color-card)] text-left text-[0.7rem] uppercase tracking-wide text-[var(--color-muted)]">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Security</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Amount range</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} className="border-b border-[var(--color-rule-soft)] last:border-0 hover:bg-[var(--color-card)]">
                  <td className="px-3 py-2 tabular whitespace-nowrap">{formatDate(t.transactionDate)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/trades/${t.id}`} className="hover:underline">
                      {t.descriptionRaw.slice(0, 64)}
                      {t.descriptionRaw.length > 64 ? "…" : ""}
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
      </section>
    </div>
  );
}
