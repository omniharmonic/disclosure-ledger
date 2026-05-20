import Link from "next/link";
import { notFound } from "next/navigation";
import { getTransaction, getCorrelations } from "@/lib/queries";
import { CorrelationCard } from "@/components/CorrelationCard";
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
  const correlations = await getCorrelations(id);
  const band = getBand(t.amountBand);

  const facts: [string, React.ReactNode][] = [
    ["Transaction date", formatDate(t.transactionDate)],
    ["Type", <span key="t" className={typeColor(t.transactionType)}>{t.transactionType}</span>],
    ["Amount range", formatAmount(t.amountBand)],
    ["Statutory band", `Band ${band.band} of 10`],
    [
      "Company",
      t.ticker ? (
        <Link key="c" href={`/companies/${encodeURIComponent(t.ticker)}`} className="text-[var(--color-accent)] hover:underline">
          {t.ticker}
        </Link>
      ) : (
        "— (unresolved / not an equity)"
      ),
    ],
    ["Sector", t.sector ?? "—"],
    ["Late notification", t.notificationLate ? "Yes — filed >30 days late" : "No"],
    ["Filing date", formatDate(t.filingDate)],
  ];

  return (
    <div className="max-w-3xl space-y-9">
      <header className="rise">
        <Link href="/trades" className="text-xs text-[var(--color-muted)] hover:underline">
          ← All trades
        </Link>
        <div className="kicker mt-2">Disclosed transaction</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
          {t.ticker ? `${t.ticker} — ` : ""}
          {t.transactionType}
        </h1>
        <p className="mt-1 font-mono text-sm text-[var(--color-muted)]">{t.descriptionRaw}</p>
      </header>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)] p-5 sm:grid-cols-2">
        {facts.map(([k, v], i) => (
          <div key={i} className="flex justify-between gap-4 border-b border-[var(--color-rule-soft)] pb-2 text-sm last:border-0">
            <dt className="text-[var(--color-muted)]">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <section>
        <div className="kicker mb-3">
          Timing correlations · {correlations.length}
        </div>
        {correlations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-rule)] p-5 text-sm text-[var(--color-muted)]">
            No statements or official actions about this security were found within the
            correlation window — 45 days before to 30 days after the transaction.
          </p>
        ) : (
          <div className="space-y-3">
            {correlations.map((c) => (
              <CorrelationCard key={c.id} c={c} />
            ))}
            <p className="text-xs text-[var(--color-muted)]">
              The signal score is a transparent analytical index (see{" "}
              <Link href="/methodology" className="underline">methodology</Link>) — not a
              finding of wrongdoing. Correlation is not causation.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)] p-5 text-sm">
        <div className="kicker">Source</div>
        <p className="mt-1 text-[var(--color-ink-soft)]">
          Row {t.rowNumber} of the OGE Form 278-T filed {formatDate(t.filingDate)}.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer"
             className="rounded border border-[var(--color-rule)] px-3 py-1.5 hover:bg-[var(--color-paper)]">
            View source PDF ↗
          </a>
          <Link href={`/filings/${t.filingId}`}
                className="rounded border border-[var(--color-rule)] px-3 py-1.5 hover:bg-[var(--color-paper)]">
            View filing
          </Link>
        </div>
      </section>
    </div>
  );
}
