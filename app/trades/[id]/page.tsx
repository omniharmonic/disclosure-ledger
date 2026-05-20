import Link from "next/link";
import { notFound } from "next/navigation";
import { getTransaction } from "@/lib/queries";
import { formatDate, formatAmount, typeColor } from "@/lib/format";
import { getBand } from "@/lib/bands";

export const dynamic = "force-dynamic";

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTransaction(id);
  if (!t) notFound();

  const band = getBand(t.amountBand);
  const facts: [string, React.ReactNode][] = [
    ["Transaction date", formatDate(t.transactionDate)],
    ["Type", <span className={typeColor(t.transactionType)}>{t.transactionType}</span>],
    ["Amount range", formatAmount(t.amountBand)],
    ["Statutory band", `Band ${band.band} of 10`],
    ["Ticker", t.ticker ?? "— (unresolved / not an equity)"],
    ["Sector", t.sector ?? "—"],
    ["Late notification", t.notificationLate ? "Yes — filer notified >30 days late" : "No"],
    ["Filing date", formatDate(t.filingDate)],
  ];

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link href="/trades" className="text-sm text-[var(--color-muted)] hover:underline">
          ← All trades
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {t.ticker ? `${t.ticker} — ` : ""}
          {t.transactionType}
        </h1>
        <p className="mt-1 font-mono text-sm text-[var(--color-muted)]">{t.descriptionRaw}</p>
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 rounded border border-[var(--color-rule)] bg-white p-5 sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-[var(--color-rule)] pb-2 text-sm last:border-0">
            <dt className="text-[var(--color-muted)]">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Timing correlations
        </h2>
        <p className="mt-2 rounded border border-dashed border-[var(--color-rule)] p-4 text-sm text-[var(--color-muted)]">
          Statements and official actions correlated with this trade are surfaced here once
          the correlation engine (Phase 3) is populated. Each correlation will show its full
          score breakdown and a primary-source link.
        </p>
      </section>

      <section className="rounded border border-[var(--color-rule)] bg-white p-5 text-sm">
        <h2 className="font-semibold">Source</h2>
        <p className="mt-1 text-[var(--color-muted)]">
          Row {t.rowNumber} of the OGE Form 278-T filed {formatDate(t.filingDate)}.
        </p>
        <div className="mt-3 flex gap-3">
          <a
            href={t.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-[var(--color-rule)] px-3 py-1.5 hover:bg-[var(--color-paper)]"
          >
            View source PDF ↗
          </a>
          <Link
            href={`/filings/${t.filingId}`}
            className="rounded border border-[var(--color-rule)] px-3 py-1.5 hover:bg-[var(--color-paper)]"
          >
            View filing
          </Link>
        </div>
      </section>

      <p className="text-xs text-[var(--color-muted)]">
        Amount ranges are broad statutory bands, not exact figures. Transaction dates may
        precede the filing date by 30–45 days.
      </p>
    </div>
  );
}
