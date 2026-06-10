/**
 * Operator review queue (FR-O3) — filings withheld from the public view
 * (`review` / `pending`), with enough context to confirm or keep withholding
 * an extraction. Protected by HTTP Basic Auth in middleware.ts (the page does
 * not exist unless ADMIN_PASSWORD is configured).
 */
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { filings, transactions } from "@/db/schema";
import { asc, desc, eq, inArray, count } from "drizzle-orm";
import { formatDate, formatAmount, typeColor } from "@/lib/format";

export const dynamic = "force-dynamic";

async function publishFiling(formData: FormData) {
  "use server";
  if (!process.env.ADMIN_PASSWORD) return; // surface disabled
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await db.update(filings).set({ status: "published" }).where(eq(filings.id, id));
  revalidatePath("/", "layout");
}

async function withholdFiling(formData: FormData) {
  "use server";
  if (!process.env.ADMIN_PASSWORD) return;
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await db.update(filings).set({ status: "review" }).where(eq(filings.id, id));
  revalidatePath("/", "layout");
}

export default async function ReviewQueuePage() {
  const queue = await db
    .select()
    .from(filings)
    .where(inArray(filings.status, ["review", "pending"]))
    .orderBy(desc(filings.filingDate));

  const published = await db
    .select({ id: filings.id, date: filings.filingDate, form: filings.formType,
              conf: filings.parseConfidence, status: filings.status, n: count(transactions.id) })
    .from(filings)
    .leftJoin(transactions, eq(transactions.filingId, filings.id))
    .where(inArray(filings.status, ["parsed", "published"]))
    .groupBy(filings.id)
    .orderBy(desc(filings.filingDate));

  return (
    <div className="space-y-10">
      <header>
        <div className="kicker">Operator console</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Review queue</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-soft)]">
          Filings below the extraction-confidence threshold are withheld from every public
          surface until confirmed here. Publishing is reversible (withhold puts a filing back
          under review).
        </p>
      </header>

      <section>
        <div className="kicker mb-3">Withheld · {queue.length}</div>
        {queue.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-rule)] p-6 text-sm text-[var(--color-muted)]">
            Nothing awaiting review.
          </p>
        ) : (
          <div className="space-y-4">
            {queue.map(async (f) => {
              const rows = await db
                .select()
                .from(transactions)
                .where(eq(transactions.filingId, f.id))
                .orderBy(asc(transactions.rowNumber))
                .limit(8);
              return (
                <div key={f.id} className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-card)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="font-display font-semibold">
                        {f.formType} · {formatDate(f.filingDate)}
                      </span>
                      <span className="ml-3 font-mono text-xs text-[var(--color-muted)]">
                        status {f.status} · confidence{" "}
                        {f.parseConfidence != null ? `${(f.parseConfidence * 100).toFixed(0)}%` : "—"} ·{" "}
                        {f.transactionCount ?? 0} rows · {f.pageCount ?? "?"} pages
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={f.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded border border-[var(--color-rule)] px-3 py-1.5 text-xs hover:bg-[var(--color-paper)]"
                      >
                        Source PDF ↗
                      </a>
                      <form action={publishFiling}>
                        <input type="hidden" name="id" value={f.id} />
                        <button className="rounded border border-[var(--color-signal)] bg-[var(--color-signal)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                          Confirm &amp; publish
                        </button>
                      </form>
                    </div>
                  </div>
                  {rows.length > 0 && (
                    <table className="mt-3 w-full border-collapse text-xs">
                      <tbody>
                        {rows.map((t) => (
                          <tr key={t.id} className="border-b border-[var(--color-rule-soft)] last:border-0">
                            <td className="py-1 pr-3 tabular text-[var(--color-muted)]">{t.rowNumber}</td>
                            <td className="py-1 pr-3 tabular whitespace-nowrap">{formatDate(t.transactionDate)}</td>
                            <td className="py-1 pr-3">{t.descriptionRaw.slice(0, 60)}</td>
                            <td className={`py-1 pr-3 ${typeColor(t.transactionType)}`}>{t.transactionType}</td>
                            <td className="py-1 tabular whitespace-nowrap">{formatAmount(t.amountBand)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="kicker mb-3">Public · {published.length}</div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-rule)] text-left text-[0.7rem] uppercase tracking-wide text-[var(--color-muted)]">
              <th className="px-2 py-1.5 font-medium">Filing</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
              <th className="px-2 py-1.5 font-medium">Confidence</th>
              <th className="px-2 py-1.5 text-right font-medium">Rows</th>
              <th className="px-2 py-1.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {published.map((f) => (
              <tr key={f.id} className="border-b border-[var(--color-rule-soft)] last:border-0">
                <td className="px-2 py-1.5">{f.form} · {formatDate(f.date)}</td>
                <td className="px-2 py-1.5 font-mono text-xs">{f.status}</td>
                <td className="px-2 py-1.5 tabular">
                  {f.conf != null ? `${(f.conf * 100).toFixed(0)}%` : "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular">{Number(f.n)}</td>
                <td className="px-2 py-1.5 text-right">
                  <form action={withholdFiling}>
                    <input type="hidden" name="id" value={f.id} />
                    <button className="rounded border border-[var(--color-rule)] px-2 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]">
                      Withhold
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
