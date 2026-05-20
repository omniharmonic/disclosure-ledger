import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCompany } from "@/lib/queries";
import { CorrelationCard } from "@/components/CorrelationCard";
import { PriceChart } from "@/components/PriceChart";
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
  const { company, transactions: txns, prices, correlations } = data;
  const topSignal = correlations[0]?.signalScore ?? 0;

  return (
    <div className="space-y-10">
      <header className="rise">
        <Link href="/companies" className="font-mono text-xs text-[var(--color-muted)] hover:underline">
          ← all companies
        </Link>
        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
          <span className="font-display text-3xl font-bold text-[var(--color-accent)]">
            {company.ticker ?? "—"}
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight">{company.name}</h1>
        </div>
        <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">
          {[company.sector, company.industry].filter(Boolean).join(" · ") ||
            "sector not yet resolved"}
        </p>
      </header>

      {/* About */}
      {(company.oneLiner || company.impactSummary) && (
        <section className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)] p-5">
          <div className="kicker">About</div>
          {company.oneLiner && (
            <p className="mt-2 font-display text-lg leading-snug">{company.oneLiner}</p>
          )}
          {company.impactSummary && (
            <>
              <div className="kicker mt-4">Intersection with the Trump administration</div>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-soft)]">
                {company.impactSummary}
              </p>
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-3 font-mono text-xs">
            {company.website && (
              <a href={company.website} target="_blank" rel="noopener noreferrer"
                 className="text-[var(--color-accent)] hover:underline">
                {company.website.replace(/^https?:\/\//, "")} ↗
              </a>
            )}
            {(company.impactSources ?? []).map((s, i) => (
              <a key={i} href={s} target="_blank" rel="noopener noreferrer"
                 className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">
                source {i + 1} ↗
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Stats */}
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
                 className="font-display text-xl font-bold text-[var(--color-accent)] hover:underline">
                {value}
              </a>
            ) : (
              <div className="font-display text-xl font-bold tabular">{value}</div>
            )}
          </div>
        ))}
      </section>

      {/* Price chart */}
      {prices.length > 1 && (
        <section>
          <div className="kicker mb-3">Share price · disclosed trades marked</div>
          <PriceChart
            prices={prices}
            trades={txns.map((t) => ({
              date: t.transactionDate,
              type: t.transactionType,
              priceAtTxn: t.priceAtTxn,
            }))}
          />
        </section>
      )}

      {/* Correlations */}
      <section>
        <div className="kicker mb-3">Timing correlations · {correlations.length}</div>
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

      {/* Trades */}
      <section>
        <div className="kicker mb-3">Disclosed trades · {txns.length}</div>
        <div className="overflow-x-auto rounded-lg border border-[var(--color-rule)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)] bg-[var(--color-card)] text-left text-[0.7rem] uppercase tracking-wide text-[var(--color-muted)]">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Amount range</th>
                <th className="px-3 py-2 text-right font-medium">Price at trade</th>
                <th className="px-3 py-2 text-right font-medium">Since trade</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} className="border-b border-[var(--color-rule-soft)] last:border-0 hover:bg-[var(--color-card)]">
                  <td className="px-3 py-2 tabular whitespace-nowrap">
                    <Link href={`/trades/${t.id}`} className="hover:underline">
                      {formatDate(t.transactionDate)}
                    </Link>
                  </td>
                  <td className={`px-3 py-2 font-medium ${typeColor(t.transactionType)}`}>
                    {t.transactionType}
                  </td>
                  <td className="px-3 py-2 tabular whitespace-nowrap">{formatAmount(t.amountBand)}</td>
                  <td className="px-3 py-2 tabular text-right">
                    {t.priceAtTxn != null ? `$${t.priceAtTxn.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2 tabular text-right">
                    {t.gainLossPct != null ? (
                      <span style={{ color: t.gainLossPct >= 0 ? "var(--color-buy)" : "var(--color-sell)" }}>
                        {t.gainLossPct >= 0 ? "+" : ""}
                        {t.gainLossPct.toFixed(1)}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 font-mono text-[0.7rem] text-[var(--color-muted)]">
          &ldquo;Since trade&rdquo; is the EOD price change from the transaction date to the
          latest close — an indicative figure, not a realized return; disclosed amounts are
          ranges, so exact share counts are unknown.
        </p>
      </section>
    </div>
  );
}
