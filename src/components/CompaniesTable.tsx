"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CompanyListItem } from "@/lib/queries";

type SortKey = "correlations" | "trades" | "ticker";

/** The full companies table — entire rows are clickable, sortable headers. */
export function CompaniesTable({ companies }: { companies: CompanyListItem[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>("correlations");

  const sorted = [...companies].sort((a, b) => {
    if (sort === "ticker") return (a.ticker ?? "").localeCompare(b.ticker ?? "");
    if (sort === "trades") return b.tradeCount - a.tradeCount;
    return b.correlationCount - a.correlationCount || b.tradeCount - a.tradeCount;
  });

  const Th = ({ k, label, right }: { k?: SortKey; label: string; right?: boolean }) => (
    <th
      className={`px-3 py-2 font-medium ${right ? "text-right" : "text-left"} ${
        k ? "cursor-pointer select-none hover:text-[var(--color-ink)]" : ""
      }`}
      onClick={k ? () => setSort(k) : undefined}
    >
      {label}
      {k && sort === k ? " ▾" : ""}
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-rule)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-rule)] bg-[var(--color-card)] text-[0.7rem] uppercase tracking-wide text-[var(--color-muted)]">
            <Th k="ticker" label="Ticker" />
            <Th label="Company" />
            <Th label="Sector" />
            <Th k="trades" label="Trades" right />
            <Th k="correlations" label="Correlations" right />
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr
              key={c.id}
              onClick={() => router.push(`/companies/${encodeURIComponent(c.ticker ?? c.name)}`)}
              className="cursor-pointer border-b border-[var(--color-rule-soft)] last:border-0 hover:bg-[var(--color-card)]"
            >
              <td className="px-3 py-2 font-mono font-bold text-[var(--color-accent)]">
                {c.ticker ?? "—"}
              </td>
              <td className="px-3 py-2 text-[var(--color-ink-soft)]">{c.name}</td>
              <td className="px-3 py-2 text-[var(--color-muted)]">{c.sector ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular">{c.tradeCount}</td>
              <td className="px-3 py-2 text-right tabular">
                {c.correlationCount > 0 ? (
                  <span className="font-semibold text-[var(--color-accent)]">
                    {c.correlationCount}
                  </span>
                ) : (
                  <span className="text-[var(--color-muted)]">0</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
