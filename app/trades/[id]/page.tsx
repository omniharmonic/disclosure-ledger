import Link from "next/link";
import { notFound } from "next/navigation";
import { getTransaction, getCorrelations } from "@/lib/queries";
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
        {correlations.length === 0 ? (
          <p className="mt-2 rounded border border-dashed border-[var(--color-rule)] p-4 text-sm text-[var(--color-muted)]">
            No statements or official actions about this security were found within the
            correlation window (45 days before to 30 days after the transaction).
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {correlations.map((c) => (
              <div key={c.id} className="rounded border border-[var(--color-rule)] bg-white p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    {c.eventKind === "statement" ? "Public statement" : "Official action"} ·{" "}
                    {c.daysGap === 0
                      ? "same day"
                      : c.daysGap > 0
                        ? `${c.daysGap}d after trade`
                        : `${-c.daysGap}d before trade`}
                  </span>
                  <span
                    className="rounded px-2 py-0.5 text-xs font-bold tabular text-white"
                    style={{
                      background:
                        c.signalScore >= 60
                          ? "var(--color-accent)"
                          : c.signalScore >= 40
                            ? "#b8860b"
                            : "var(--color-muted)",
                    }}
                    title="Potential conflict signal — an analytical index, not a verdict"
                  >
                    signal {c.signalScore.toFixed(0)}/100
                  </span>
                </div>
                <p className="mt-2 text-sm">
                  {c.eventTitle}
                  {c.eventTitle.length >= 240 ? "…" : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
                  {Object.entries(c.components).map(([k, v]) => (
                    <span key={k} className="tabular">
                      {k}: {typeof v === "number" ? v.toFixed(2) : String(v)}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-xs">
                  <span className="text-[var(--color-muted)]">{formatDate(c.eventDate)} · </span>
                  <a
                    href={c.eventUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-accent)] hover:underline"
                  >
                    primary source ↗
                  </a>
                </div>
              </div>
            ))}
            <p className="text-xs text-[var(--color-muted)]">
              The signal score is a transparent analytical index (see{" "}
              <Link href="/methodology" className="underline">
                methodology
              </Link>
              ), not a finding of wrongdoing. Correlation is not causation.
            </p>
          </div>
        )}
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
