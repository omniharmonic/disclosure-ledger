import Link from "next/link";
import type { Metadata } from "next";
import { listFilings } from "@/lib/queries";
import { safeLoad } from "@/lib/safe-load";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Filings" };
/** ISR — data changes at most once per pipeline run; revalidated on a timer
 *  and on demand via /api/revalidate after each run (ARCHITECTURE §7.2). */
export const revalidate = 300;

export default async function FilingsPage() {
  const rows = await safeLoad("filings", listFilings, []);
  return (
    <div className="space-y-6">
      <header className="rise">
        <div className="kicker">Source documents</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Filings</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          Every OGE financial-disclosure filing ingested and parsed. Duplicates from the White
          House are superseded by the higher-quality OGE copy; filings under review are
          withheld until a human confirms the extraction.
        </p>
      </header>
      <div className="overflow-x-auto rounded border border-[var(--color-rule)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-rule)] bg-white text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <th className="px-3 py-2 font-medium">Filing date</th>
              <th className="px-3 py-2 font-medium">Form</th>
              <th className="px-3 py-2 font-medium">Transactions</th>
              <th className="px-3 py-2 font-medium">Pages</th>
              <th className="px-3 py-2 font-medium">Parse confidence</th>
              <th className="px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id} className="border-b border-[var(--color-rule)] last:border-0 hover:bg-white">
                <td className="px-3 py-2 tabular whitespace-nowrap">
                  <Link href={`/filings/${f.id}`} className="hover:underline">
                    {formatDate(f.filingDate)}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{f.formType}</td>
                <td className="px-3 py-2 tabular">{f.transactionCount ?? "—"}</td>
                <td className="px-3 py-2 tabular">{f.pageCount ?? "—"}</td>
                <td className="px-3 py-2 tabular">
                  {f.parseConfidence != null ? `${(f.parseConfidence * 100).toFixed(0)}%` : "—"}
                </td>
                <td className="px-3 py-2">
                  <a
                    href={f.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                  >
                    {f.sourceDomain} ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">No published filings yet.</p>
      )}
    </div>
  );
}
